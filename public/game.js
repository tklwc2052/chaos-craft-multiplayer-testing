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
let pendingGameData = null; // Store server data here until game starts

// FORKLIFT VARIABLES
let forklift;
let isDriving = false;
let currentDriverId = null;
let forkMovingUp = false; 
let forkMovingDown = false;

// --- LOGIN & START ---
document.getElementById('startBtn').addEventListener('click', () => {
    const name = document.getElementById('usernameInput').value || "Player";
    document.getElementById('userNameDisplay').innerText = name;
    document.getElementById('login').style.display = 'none';
    document.getElementById('ui').style.display = 'block';
    
    init3D();
    socket.emit('join', { username: name });

    // CHECK: Did the server send us the forklift while we were on the login screen?
    if (pendingGameData) {
        loadGameWorld(pendingGameData);
        pendingGameData = null; // Clear the buffer
    }
});

function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); 
    
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.rotation.order = 'YXZ';

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    controls = new THREE.PointerLockControls(camera, document.body);
    camera.position.set(0, 1.6, 5); 
    
    document.addEventListener('click', () => {
        if (!isDriving) controls.lock();
    });

    // Lighting
    scene.add(new THREE.HemisphereLight(0xeeeeff, 0x777788, 1));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);
    
    // Floor
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshPhongMaterial({color: 0x567d46}));
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

// --- HELPER TO LOAD OBJECTS SAFELY ---
function loadGameWorld(data) {
    if (!scene) return; // Safety check

    // 1. Setup Forklift
    if (!forklift) {
        forklift = createForklift();
        scene.add(forklift);
    }
    
    // Sync Position
    forklift.position.set(data.forklift.x, data.forklift.y, data.forklift.z);
    forklift.rotation.y = data.forklift.ry;
    if (forklift.userData.forksObj) {
        forklift.userData.forksObj.position.y = data.forklift.forkHeight;
    }
    currentDriverId = data.forklift.driverId;

    // 2. Setup Existing Players
    Object.keys(data.players).forEach(id => {
        if (id !== socket.id && !otherPlayers[id]) {
            const mesh = createPlayerMesh(data.players[id].color);
            scene.add(mesh);
            otherPlayers[id] = mesh;
        }
    });
}

function createForklift() {
    const group = new THREE.Group();
    // Chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 2.5), new THREE.MeshLambertMaterial({ color: 0xFFD700 }));
    chassis.position.y = 0.5;
    group.add(chassis);

    // Roll Cage
    const cageMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), cageMat); fl.position.set(-0.6, 1.4, 0.5);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), cageMat); fr.position.set(0.6, 1.4, 0.5);
    const rl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), cageMat); rl.position.set(-0.6, 1.4, -1.0);
    const rr = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), cageMat); rr.position.set(0.6, 1.4, -1.0);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 1.7), cageMat); roof.position.set(0, 2.1, -0.25);
    group.add(fl, fr, rl, rr, roof);

    // Mast
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.0, 3.0, 0.2), new THREE.MeshLambertMaterial({ color: 0x333333 }));
    mast.position.set(0, 1.5, 1.35);
    group.add(mast);

    // Forks Group
    const forks = new THREE.Group();
    forks.position.set(0, 0.3, 1.45); 
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.1), cageMat);
    forks.add(plate);
    const tinesGeo = new THREE.BoxGeometry(0.15, 0.1, 1.5);
    const leftTine = new THREE.Mesh(tinesGeo, cageMat); leftTine.position.set(-0.4, 0, 0.7);
    const rightTine = new THREE.Mesh(tinesGeo, cageMat); rightTine.position.set(0.4, 0, 0.7);
    forks.add(leftTine, rightTine);
    
    group.add(forks);
    group.userData.forksObj = forks;
    return group;
}

function attemptToggleDrive() {
    if (isDriving) {
        isDriving = false;
        controls.lock();
        camera.position.x -= 2;
        camera.position.y = 1.6;
        socket.emit('leave-seat');
    } else {
        if (forklift && camera.position.distanceTo(forklift.position) < 4) {
            socket.emit('request-drive');
        }
    }
}

// --- NETWORK EVENTS ---

socket.on('init-game', (data) => {
    // If scene is ready, load now. If not, save for later.
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
        controls.unlock(); 
    }
});

socket.on('update-forklift', (data) => {
    if (!isDriving && forklift) {
        forklift.position.x = data.x;
        forklift.position.z = data.z;
        forklift.rotation.y = data.ry;
        if(forklift.userData.forksObj) {
            forklift.userData.forksObj.position.y = data.forkHeight;
        }
    }
});

socket.on('update-players', (serverPlayers) => {
    if (!scene) return; // Ignore if game hasn't started
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
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 }); 
    const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.05), eyeMat); leftEye.position.set(-0.25, 0.6, -0.51); 
    const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.05), eyeMat); rightEye.position.set(0.25, 0.6, -0.51); 
    group.add(leftEye, rightEye);
    return group;
}

function animate() {
    requestAnimationFrame(animate);

    // If game hasn't started or controls aren't ready, skip logic
    if (!scene || !forklift) return; 

    if (isDriving) {
        const speed = 10.0 * 0.016;
        const rotSpeed = 2.0 * 0.016;
        let moved = false;

        if (moveForward) {
            forklift.position.x -= Math.sin(forklift.rotation.y) * speed;
            forklift.position.z -= Math.cos(forklift.rotation.y) * speed;
            moved = true;
        }
        if (moveBackward) {
            forklift.position.x += Math.sin(forklift.rotation.y) * speed;
            forklift.position.z += Math.cos(forklift.rotation.y) * speed;
            moved = true;
        }
        if (moveLeft) { forklift.rotation.y += rotSpeed; moved = true; }
        if (moveRight) { forklift.rotation.y -= rotSpeed; moved = true; }

        const forks = forklift.userData.forksObj;
        if (forkMovingUp && forks.position.y < 2.5) { forks.position.y += 0.05; moved = true; }
        if (forkMovingDown && forks.position.y > 0.1) { forks.position.y -= 0.05; moved = true; }

        camera.position.copy(forklift.position);
        camera.position.y += 1.5; 
        camera.position.x -= Math.sin(forklift.rotation.y) * 0.5; 
        camera.position.z -= Math.cos(forklift.rotation.y) * 0.5;
        camera.rotation.y = forklift.rotation.y + Math.PI;

        if (moved) {
            socket.emit('move-forklift', {
                x: forklift.position.x,
                z: forklift.position.z,
                ry: forklift.rotation.y,
                forkHeight: forks.position.y
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

        // COLLISION (Player vs Forklift)
        const dist = camera.position.distanceTo(forklift.position);
        if (dist < 2.5) {
            const pushDir = camera.position.clone().sub(forklift.position).normalize();
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
