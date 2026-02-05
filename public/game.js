const socket = io();
let scene, camera, renderer, controls;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, isShifting = false;
let velocity = new THREE.Vector3(), direction = new THREE.Vector3();
let otherPlayers = {}; 

// GAME VARIABLES
const GRAVITY = 24.0; 
const JUMP_FORCE = 10.0; 
let canJump = false;
let lastSentPos = { x: 0, y: 0, z: 0, ry: 0 };
let pendingGameData = null; 

// FORKLIFT VARIABLES
let forklift = null; // Will store the loaded GLB model
let isDriving = false;
let currentDriverId = null;

// --- LOGIN & START ---
document.getElementById('startBtn').addEventListener('click', () => {
    const name = document.getElementById('usernameInput').value || "Player";
    document.getElementById('userNameDisplay').innerText = name;
    document.getElementById('login').style.display = 'none';
    document.getElementById('ui').style.display = 'block';
    
    init3D();
    socket.emit('join', { username: name });
});

function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); 
    // Fog helps with depth perception
    scene.fog = new THREE.Fog(0x87ceeb, 10, 80);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.rotation.order = 'YXZ';

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; 
    
    // IMPORTANT: GLB files need this encoding to look correct (not too dark)
    renderer.outputEncoding = THREE.sRGBEncoding; 
    
    document.body.appendChild(renderer.domElement);

    controls = new THREE.PointerLockControls(camera, document.body);
    camera.position.set(0, 1.6, 5); 
    
    document.addEventListener('click', () => {
        controls.lock();
    });

    // --- LIGHTING SETUP (Crucial for imported models) ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(20, 30, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048; 
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    scene.add(dirLight);
    
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({color: 0x567d46, roughness: 0.8}));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Inputs
    window.addEventListener('keydown', (e) => {
        if(e.code==='KeyW') moveForward=true; 
        if(e.code==='KeyS') moveBackward=true;
        if(e.code==='KeyA') moveLeft=true; 
        if(e.code==='KeyD') moveRight=true;
        if(e.shiftKey) isShifting = true;
        if(e.code==='Space' && !isDriving && canJump) { velocity.y = JUMP_FORCE; canJump = false; }
        
        if(e.code === 'KeyE') attemptToggleDrive();
    });

    window.addEventListener('keyup', (e) => {
        if(e.code==='KeyW') moveForward=false; 
        if(e.code==='KeyS') moveBackward=false;
        if(e.code==='KeyA') moveLeft=false; 
        if(e.code==='KeyD') moveRight=false;
        if(!e.shiftKey) isShifting = false;
    });

    animate();
}

// --- LOADER FUNCTION ---
function loadGameWorld(data) {
    if (!scene) return; 

    if (!forklift) {
        // Load the external GLB file
        const loader = new THREE.GLTFLoader();
        
        loader.load('forklift.glb', (gltf) => {
            forklift = gltf.scene;
            
            // --- SCALE SETTINGS ---
            // If the forklift is giant or tiny, change these numbers (e.g., 0.1 or 10)
            forklift.scale.set(1, 1, 1); 
            
            // Enable shadows on the model
            forklift.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            scene.add(forklift);

            // Set initial position from server
            forklift.position.set(data.forklift.x, data.forklift.y, data.forklift.z);
            forklift.rotation.y = data.forklift.ry;
            currentDriverId = data.forklift.driverId;
            console.log("Forklift Loaded Successfully!");

        }, undefined, (error) => {
            console.error('ERROR LOADING MODEL:', error);
            alert("Could not load forklift.glb. Check console for details.");
        });
    } else {
        // Update existing
        forklift.position.set(data.forklift.x, data.forklift.y, data.forklift.z);
        forklift.rotation.y = data.forklift.ry;
        currentDriverId = data.forklift.driverId;
    }

    Object.keys(data.players).forEach(id => {
        if (id !== socket.id && !otherPlayers[id]) {
            const mesh = createPlayerMesh(data.players[id].color);
            scene.add(mesh);
            otherPlayers[id] = mesh;
        }
    });
}

function attemptToggleDrive() {
    if (isDriving) {
        // EXIT VEHICLE
        isDriving = false;
        camera.position.x -= 2;
        camera.position.y = 1.6;
        socket.emit('leave-seat');
    } else {
        // ENTER VEHICLE
        if (forklift && camera.position.distanceTo(forklift.position) < 5) {
            socket.emit('request-drive');
        }
    }
}

// --- NETWORK EVENTS ---

socket.on('init-game', (data) => {
    if (scene) {
        loadGameWorld(data);
    } else {
        pendingGameData = data;
    }
});

socket.on('driver-status', (data) => {
    currentDriverId = data.driverId;
    if (currentDriverId === socket.id) {
        isDriving = true;
    }
});

socket.on('update-forklift', (data) => {
    if (!isDriving && forklift) {
        forklift.position.x = data.x;
        forklift.position.z = data.z;
        forklift.rotation.y = data.ry;
        // Fork height visual update disabled for GLB 
        // until we know the specific mesh name in your file.
    }
});

socket.on('update-players', (serverPlayers) => {
    if (!scene) return; 
    Object.keys(serverPlayers).forEach(id => {
        if (id !== socket.id && !otherPlayers[id]) {
            const mesh = createPlayerMesh(serverPlayers[id].color);
            scene.add(mesh);
            otherPlayers[id] = mesh;
        }
    });
});

socket.on('player-moved', (data) => { 
    if (otherPlayers[data.id]) {
        otherPlayers[data.id].position.set(data.pos.x, data.pos.y - 0.8, data.pos.z);
        otherPlayers[data.id].rotation.y = data.pos.ry;
    }
});

socket.on('player-left', (id) => { 
    if (otherPlayers[id]) { scene.remove(otherPlayers[id]); delete otherPlayers[id]; } 
});

function createPlayerMesh(color) {
    const group = new THREE.Group();
    // Simple blocky character
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ color: parseInt(color, 16) }));
    body.castShadow = true;
    group.add(body);
    return group;
}

function animate() {
    requestAnimationFrame(animate);
    if (!scene) return; 

    // Logic for DRIVING
    if (isDriving && forklift) {
        const speed = 10.0 * 0.016;
        const rotSpeed = 2.0 * 0.016;
        let moved = false;

        // Inverted controls style (common for forklifts)
        if (moveForward) {
            forklift.position.x += Math.sin(forklift.rotation.y) * speed;
            forklift.position.z += Math.cos(forklift.rotation.y) * speed;
            moved = true;
        }
        if (moveBackward) {
            forklift.position.x -= Math.sin(forklift.rotation.y) * speed;
            forklift.position.z -= Math.cos(forklift.rotation.y) * speed;
            moved = true;
        }
        if (moveLeft) { forklift.rotation.y -= rotSpeed; moved = true; }
        if (moveRight) { forklift.rotation.y += rotSpeed; moved = true; }

        // CAMERA FOLLOW
        // Change these numbers if the camera is inside the model
        // (x: 0, y: 2.5, z: 0) puts camera above center
        const seatOffset = new THREE.Vector3(0, 2.5, 0.0); 
        camera.position.copy(forklift.position).add(seatOffset);

        if (moved) {
            socket.emit('move-forklift', {
                x: forklift.position.x,
                z: forklift.position.z,
                ry: forklift.rotation.y,
                forkHeight: 0 // Placeholder
            });
        }

    } else if (controls.isLocked) {
        // Logic for WALKING
        let delta = 0.016;
        let speed = isShifting ? 150.0 : 400.0;
        let targetHeight = isShifting ? 1.2 : 1.6;

        camera.position.y += (targetHeight - camera.position.y) * 0.2; 
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= GRAVITY * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        camera.position.y += (velocity.y * delta);

        // Simple Collision with Forklift
        if (forklift) {
            const dist = camera.position.distanceTo(forklift.position);
            // If you get too close (3.0 units), push back
            if (dist < 3.0) {
                const pushDir = camera.position.clone().sub(forklift.position).normalize();
                camera.position.add(pushDir.multiplyScalar(0.1));
                velocity.x = 0; velocity.z = 0;
            }
        }

        if (camera.position.y < targetHeight) {
            velocity.y = 0;
            camera.position.y = targetHeight;
            canJump = true;
        }

        if (Math.abs(camera.position.x - lastSentPos.x) > 0.1 || Math.abs(camera.position.z - lastSentPos.z) > 0.1) {
            socket.emit('move', { x: camera.position.x, y: camera.position.y, z: camera.position.z, ry: camera.rotation.y });
            lastSentPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z, ry: camera.rotation.y };
        }
    }
    renderer.render(scene, camera);
}
