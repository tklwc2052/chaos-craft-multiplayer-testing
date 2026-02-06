const socket = io();
let scene, camera, renderer, controls;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, isShifting = false;
let forkMovingUp = false, forkMovingDown = false;
let velocity = new THREE.Vector3(), direction = new THREE.Vector3();
let otherPlayers = {}; 

// --- 🔧 SETTINGS ---
// I noticed your file has a scale of 22.8 in the data. 
// We might need to shrink it. Try 0.1 if it's huge, or 1.0 if it's normal.
const MODEL_SCALE = 1.0;   
const ENTER_DISTANCE = 15.0; // Generous range to enter
// -------------------

// UI & DEBUG
let statusDiv; 

// GAME VARIABLES
const GRAVITY = 24.0; 
const JUMP_FORCE = 10.0; 
let canJump = false;
let lastSentPos = { x: 0, y: 0, z: 0, ry: 0 };

// FORKLIFT VARIABLES
let forklift = null;      // The Logic Wrapper (Hitbox)
let forkliftMesh = null;  // The Visual File
let forksMesh = null;     // The Moving Forks (If found)
let isDriving = false;
let currentDriverId = null;

// --- LOGIN & START ---
document.getElementById('startBtn').addEventListener('click', () => {
    const name = document.getElementById('usernameInput').value || "Player";
    document.getElementById('userNameDisplay').innerText = name;
    document.getElementById('login').style.display = 'none';
    document.getElementById('ui').style.display = 'block';
    
    createDebugUI();
    init3D();
    socket.emit('join', { username: name });
});

function createDebugUI() {
    statusDiv = document.createElement('div');
    statusDiv.style.position = 'absolute';
    statusDiv.style.top = '10px';
    statusDiv.style.right = '10px';
    statusDiv.style.width = '300px';
    statusDiv.style.color = 'yellow';
    statusDiv.style.backgroundColor = 'rgba(0,0,0,0.8)';
    statusDiv.style.padding = '10px';
    statusDiv.style.fontFamily = 'monospace';
    statusDiv.style.fontSize = '12px';
    statusDiv.style.zIndex = '999';
    statusDiv.innerHTML = "STATUS: CONNECTING...";
    document.body.appendChild(statusDiv);
}

function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); 
    scene.fog = new THREE.Fog(0x87ceeb, 10, 80);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.rotation.order = 'YXZ';

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; 
    renderer.outputEncoding = THREE.sRGBEncoding; 
    document.body.appendChild(renderer.domElement);

    controls = new THREE.PointerLockControls(camera, document.body);
    camera.position.set(0, 5, 15);
    camera.lookAt(0, 0, 0);
    
    document.addEventListener('click', () => {
        controls.lock();
    });

    // LIGHTING - Bright and Soft for Imported Models
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(20, 30, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);
    
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({color: 0x567d46}));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // INPUTS
    window.addEventListener('keydown', (e) => {
        if(e.code==='KeyW') moveForward=true; 
        if(e.code==='KeyS') moveBackward=true;
        if(e.code==='KeyA') moveLeft=true; 
        if(e.code==='KeyD') moveRight=true;
        if(e.shiftKey) isShifting = true;
        if(e.code==='Space' && !isDriving && canJump) { velocity.y = JUMP_FORCE; canJump = false; }
        if(e.code === 'KeyE') attemptToggleDrive();
        if(e.code === 'KeyR') forkMovingUp = true;
        if(e.code === 'KeyF') forkMovingDown = true;
    });

    window.addEventListener('keyup', (e) => {
        if(e.code==='KeyW') moveForward=false; 
        if(e.code==='KeyS') moveBackward=false;
        if(e.code==='KeyA') moveLeft=false; 
        if(e.code==='KeyD') moveRight=false;
        if(!e.shiftKey) isShifting = false;
        if(e.code === 'KeyR') forkMovingUp = false;
        if(e.code === 'KeyF') forkMovingDown = false;
    });

    animate();
}

function loadGameWorld(data) {
    if (!scene) return; 

    if (!forklift) {
        const loader = new THREE.GLTFLoader();
        statusDiv.innerHTML = "STATUS: LOADING FILE...";

        loader.load('forklift.glb', (gltf) => {
            forkliftMesh = gltf.scene;

            // --- 🔧 AUTO-CENTER & FIXER ---
            forklift = new THREE.Group();
            scene.add(forklift);
            forklift.add(forkliftMesh);

            // 1. Measure the model
            const box = new THREE.Box3().setFromObject(forkliftMesh);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const bottomY = box.min.y;

            // 2. Fix the "Random Spawn" (Offset)
            // Your file has an offset of X:54, Z:3. This undoes that.
            forkliftMesh.position.x = -center.x;
            forkliftMesh.position.z = -center.z;
            forkliftMesh.position.y = -bottomY; 

            // 3. Fix the Size
            // If it's massive (size > 20), shrink it. If tiny, grow it.
            if (size.y > 10) {
                const autoScale = 3.0 / size.y; // Target 3 meters height
                forkliftMesh.scale.set(autoScale, autoScale, autoScale);
            } else {
                forkliftMesh.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
            }
            
            // 4. Try to find parts (Even though it's likely fused)
            forkliftMesh.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    // Check if there is a separate piece for forks
                    if (child.name.toLowerCase().includes("fork") || child.name.toLowerCase().includes("lift") || child.name.includes("geometry_3")) {
                        forksMesh = child;
                    }
                }
            });

            if (forksMesh) {
                statusDiv.innerHTML = "STATUS: READY.<br>FORKS FOUND: " + forksMesh.name;
            } else {
                statusDiv.innerHTML = "STATUS: READY.<br>NOTE: Forks are fused to body (cannot move).";
            }

            // Sync with Server Position
            forklift.position.set(data.forklift.x, data.forklift.y, data.forklift.z);
            forklift.rotation.y = data.forklift.ry;
            currentDriverId = data.forklift.driverId;

        }, undefined, (error) => {
            statusDiv.innerHTML = "STATUS: ERROR.<br>" + error;
            console.error(error);
        });
    } else {
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
        isDriving = false;
        camera.position.x -= 2;
        camera.position.y = 1.6;
        socket.emit('leave-seat');
    } else {
        // Distance check works better now that model is centered
        if (forklift && camera.position.distanceTo(forklift.position) < ENTER_DISTANCE) {
            socket.emit('request-drive');
        } else {
            statusDiv.innerHTML = "TOO FAR TO DRIVE!";
        }
    }
}

// --- NETWORK EVENTS ---

socket.on('init-game', (data) => {
    if (scene) loadGameWorld(data);
});

socket.on('driver-status', (data) => {
    currentDriverId = data.driverId;
    if (currentDriverId === socket.id) isDriving = true;
});

socket.on('update-forklift', (data) => {
    if (!isDriving && forklift) {
        forklift.position.x = data.x;
        forklift.position.z = data.z;
        forklift.rotation.y = data.ry;
        if(forksMesh) forksMesh.position.y += (data.forkHeight - forksMesh.position.y) * 0.2;
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
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ color: parseInt(color, 16) }));
    group.add(body);
    return group;
}

function animate() {
    requestAnimationFrame(animate);
    if (!scene) return; 

    if (isDriving && forklift) {
        const speed = 10.0 * 0.016;
        const rotSpeed = 2.0 * 0.016;
        let moved = false;

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

        if (forksMesh) {
            if (forkMovingUp) { forksMesh.position.y += 0.05; moved = true; }
            if (forkMovingDown) { forksMesh.position.y -= 0.05; moved = true; }
        }

        // Camera locked to seat (Adjusted for generic model height)
        const seatOffset = new THREE.Vector3(0, 3.5, 0.0); 
        camera.position.copy(forklift.position).add(seatOffset);

        if (moved) {
            socket.emit('move-forklift', {
                x: forklift.position.x,
                z: forklift.position.z,
                ry: forklift.rotation.y,
                forkHeight: forksMesh ? forksMesh.position.y : 0
            });
        }

    } else if (controls.isLocked) {
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
