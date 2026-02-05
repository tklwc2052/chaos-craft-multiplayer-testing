const socket = io();
let scene, camera, renderer, controls;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, isShifting = false;
let forkMovingUp = false, forkMovingDown = false;
let velocity = new THREE.Vector3(), direction = new THREE.Vector3();
let otherPlayers = {}; 

// DEBUG VARIABLES
let debugBox; 
let statusDiv; // To show errors on screen

// GAME VARIABLES
const GRAVITY = 24.0; 
const JUMP_FORCE = 10.0; 
let canJump = false;
let lastSentPos = { x: 0, y: 0, z: 0, ry: 0 };
let pendingGameData = null; 

// FORKLIFT VARIABLES
let forklift = null; 
let forksMesh = null;
let isDriving = false;
let currentDriverId = null;

// --- LOGIN & START ---
document.getElementById('startBtn').addEventListener('click', () => {
    const name = document.getElementById('usernameInput').value || "Player";
    document.getElementById('userNameDisplay').innerText = name;
    document.getElementById('login').style.display = 'none';
    document.getElementById('ui').style.display = 'block';
    
    // Create Debug Text UI
    createDebugUI();
    
    init3D();
    socket.emit('join', { username: name });
});

function createDebugUI() {
    statusDiv = document.createElement('div');
    statusDiv.style.position = 'absolute';
    statusDiv.style.top = '10px';
    statusDiv.style.right = '10px';
    statusDiv.style.color = 'yellow';
    statusDiv.style.backgroundColor = 'rgba(0,0,0,0.8)';
    statusDiv.style.padding = '10px';
    statusDiv.style.fontFamily = 'monospace';
    statusDiv.style.zIndex = '999';
    statusDiv.innerHTML = "STATUS: WAITING FOR SERVER...";
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
    camera.position.set(0, 1.6, 10); // Spawn further back to see the model
    
    document.addEventListener('click', () => {
        controls.lock();
    });

    // STRONG LIGHTING (To make sure we can see it)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(20, 30, 10);
    scene.add(dirLight);
    
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({color: 0x567d46}));
    ground.rotation.x = -Math.PI / 2;
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

    // 1. Create a RED DEBUG BOX where the forklift should be
    if (!debugBox) {
        debugBox = new THREE.Mesh(
            new THREE.BoxGeometry(2, 2, 2), 
            new THREE.MeshBasicMaterial({ color: 0xFF0000, wireframe: true })
        );
        scene.add(debugBox);
        debugBox.position.set(data.forklift.x, data.forklift.y, data.forklift.z);
        statusDiv.innerHTML = "STATUS: SERVER CONNECTED.<br>ATTEMPTING TO LOAD MODEL...";
    }

    if (!forklift) {
        const loader = new THREE.GLTFLoader();
        
        // ATTEMPT TO LOAD
        loader.load('forklift.glb', (gltf) => {
            statusDiv.innerHTML = "STATUS: MODEL LOADED!<br>SEARCHING FOR FORKS...";
            
            forklift = gltf.scene;
            
            // --- SCALE FIX: TRY INCREASING THIS IF IT'S INVISIBLE ---
            forklift.scale.set(1, 1, 1); 
            // -------------------------------------------------------

            // Find Forks
            forklift.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    console.log("Found Part: " + child.name); // Check console (F12)
                    if (child.name.includes("Fork") || child.name.includes("Lift") || child.name.includes("geometry_3")) {
                        forksMesh = child;
                        statusDiv.innerHTML += "<br>FORKS FOUND: " + child.name;
                    }
                }
            });

            // If we didn't find specific forks, guess the last mesh
            if(!forksMesh) {
                statusDiv.innerHTML += "<br>WARNING: Named forks not found. Guessing...";
                // Logic to grab a child mesh as fallback could go here
            }

            // REMOVE DEBUG BOX AND ADD MODEL
            scene.remove(debugBox);
            scene.add(forklift);

            forklift.position.set(data.forklift.x, data.forklift.y, data.forklift.z);
            forklift.rotation.y = data.forklift.ry;
            currentDriverId = data.forklift.driverId;

        }, 
        // PROGRESS
        (xhr) => {
            const percent = (xhr.loaded / xhr.total * 100).toFixed(0);
            statusDiv.innerHTML = "STATUS: DOWNLOADING MODEL... " + percent + "%";
        }, 
        // ERROR
        (error) => {
            console.error('ERROR:', error);
            statusDiv.innerHTML = "STATUS: ERROR LOADING FILE!<br>Check Console (F12).<br>Is 'forklift.glb' in the public folder?";
            statusDiv.style.color = "red";
            // Turn debug box blue to indicate error
            debugBox.material.color.setHex(0x0000FF); 
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
    // If debug box exists (meaning model failed), allow driving the box
    let target = forklift || debugBox;
    
    if (isDriving) {
        isDriving = false;
        camera.position.x -= 2;
        camera.position.y = 1.6;
        socket.emit('leave-seat');
    } else {
        if (target && camera.position.distanceTo(target.position) < 5) {
            socket.emit('request-drive');
        }
    }
}

// --- NETWORK EVENTS ---

socket.on('init-game', (data) => {
    if (scene) loadGameWorld(data);
    else pendingGameData = data;
});

socket.on('driver-status', (data) => {
    currentDriverId = data.driverId;
    if (currentDriverId === socket.id) isDriving = true;
});

socket.on('update-forklift', (data) => {
    let target = forklift || debugBox;
    if (!isDriving && target) {
        target.position.x = data.x;
        target.position.z = data.z;
        target.rotation.y = data.ry;
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

    // Handle Driving for EITHER the model or the debug box
    let target = forklift || debugBox;

    if (isDriving && target) {
        const speed = 10.0 * 0.016;
        const rotSpeed = 2.0 * 0.016;
        let moved = false;

        if (moveForward) {
            target.position.x += Math.sin(target.rotation.y) * speed;
            target.position.z += Math.cos(target.rotation.y) * speed;
            moved = true;
        }
        if (moveBackward) {
            target.position.x -= Math.sin(target.rotation.y) * speed;
            target.position.z -= Math.cos(target.rotation.y) * speed;
            moved = true;
        }
        if (moveLeft) { target.rotation.y -= rotSpeed; moved = true; }
        if (moveRight) { target.rotation.y += rotSpeed; moved = true; }

        if (forksMesh) {
            if (forkMovingUp && forksMesh.position.y < 2.5) { forksMesh.position.y += 0.05; moved = true; }
            if (forkMovingDown && forksMesh.position.y > 0.0) { forksMesh.position.y -= 0.05; moved = true; }
        }

        const seatOffset = new THREE.Vector3(0, 2.5, 0.0); 
        camera.position.copy(target.position).add(seatOffset);

        if (moved) {
            socket.emit('move-forklift', {
                x: target.position.x,
                z: target.position.z,
                ry: target.rotation.y,
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

        if (target && camera.position.distanceTo(target.position) < 3.0) {
            const pushDir = camera.position.clone().sub(target.position).normalize();
            camera.position.add(pushDir.multiplyScalar(0.1));
            velocity.x = 0; velocity.z = 0;
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
