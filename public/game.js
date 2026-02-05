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

    if (pendingGameData) {
        loadGameWorld(pendingGameData);
        pendingGameData = null; 
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
        controls.lock();
    });

    scene.add(new THREE.HemisphereLight(0xeeeeff, 0x777788, 1));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);
    
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
    if (!scene) return; 

    if (!forklift) {
        forklift = createForklift();
        scene.add(forklift);
    }
    
    forklift.position.set(data.forklift.x, data.forklift.y, data.forklift.z);
    forklift.rotation.y = data.forklift.ry;
    if (forklift.userData.forksObj) {
        forklift.userData.forksObj.position.y = data.forklift.forkHeight;
    }
    currentDriverId = data.forklift.driverId;

    Object.keys(data.players).forEach(id => {
        if (id !== socket.id && !otherPlayers[id]) {
            const mesh = createPlayerMesh(data.players[id].color);
            scene.add(mesh);
            otherPlayers[id] = mesh;
        }
    });
}

// --- DETAILED "CAT" STYLE FORKLIFT MODEL ---
function createForklift() {
    const group = new THREE.Group();

    // --- MATERIALS ---
    const yellowMat = new THREE.MeshLambertMaterial({ color: 0xFFA500 }); // CAT Orange/Yellow
    const blackMat = new THREE.MeshLambertMaterial({ color: 0x111111 }); // Tires/Cage
    const greyMat = new THREE.MeshLambertMaterial({ color: 0x333333 });  // Mast
    const darkGreyMat = new THREE.MeshLambertMaterial({ color: 0x222222 }); // Seat

    // 1. CHASSIS
    const baseGeo = new THREE.BoxGeometry(1.4, 0.5, 2.2);
    const base = new THREE.Mesh(baseGeo, yellowMat);
    base.position.y = 0.5;
    group.add(base);

    // Rear Counterweight
    const counterWeight = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 0.8), yellowMat);
    counterWeight.position.set(0, 1.0, 0.7); 
    group.add(counterWeight);

    // Engine Cover
    const engineCover = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.8), yellowMat);
    engineCover.position.set(0, 0.8, -0.1);
    group.add(engineCover);

    // 2. WHEELS
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 32);
    wheelGeo.rotateZ(Math.PI / 2);
    const fl = new THREE.Mesh(wheelGeo, blackMat); fl.position.set(-0.7, 0.35, -0.6);
    const fr = new THREE.Mesh(wheelGeo, blackMat); fr.position.set(0.7, 0.35, -0.6);
    const rl = new THREE.Mesh(wheelGeo, blackMat); rl.position.set(-0.7, 0.35, 0.7);
    const rr = new THREE.Mesh(wheelGeo, blackMat); rr.position.set(0.7, 0.35, 0.7);
    group.add(fl, fr, rl, rr);

    // 3. ROLL CAGE
    const postGeo = new THREE.BoxGeometry(0.08, 1.6, 0.08);
    const p1 = new THREE.Mesh(postGeo, blackMat); p1.position.set(-0.6, 1.6, -0.3);
    const p2 = new THREE.Mesh(postGeo, blackMat); p2.position.set(0.6, 1.6, -0.3);
    const p3 = new THREE.Mesh(postGeo, blackMat); p3.position.set(-0.6, 1.6, 0.9);
    const p4 = new THREE.Mesh(postGeo, blackMat); p4.position.set(0.6, 1.6, 0.9);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 1.4), blackMat);
    roof.position.set(0, 2.4, 0.3);
    group.add(p1, p2, p3, p4, roof);

    // Seat
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), darkGreyMat);
    seatBase.position.set(0, 0.8, 0.4);
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.1), darkGreyMat);
    seatBack.position.set(0, 1.1, 0.7);
    group.add(seatBase, seatBack);

    // Steering
    const steeringCol = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6), blackMat);
    steeringCol.position.set(0, 1.1, -0.1);
    steeringCol.rotation.x = -0.5;
    const steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 16), blackMat);
    steeringWheel.position.set(0, 1.35, -0.25);
    steeringWheel.rotation.x = -0.5;
    group.add(steeringCol, steeringWheel);

    // 4. MAST
    const mastGeo = new THREE.BoxGeometry(0.1, 2.8, 0.15);
    const leftMast = new THREE.Mesh(mastGeo, greyMat); leftMast.position.set(-0.4, 1.5, -1.05);
    const rightMast = new THREE.Mesh(mastGeo, greyMat); rightMast.position.set(0.4, 1.5, -1.05);
    const mastBar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.1), greyMat); mastBar.position.set(0, 2.8, -1.05);
    group.add(leftMast, rightMast, mastBar);

    // 5. FORKS
    const forksGroup = new THREE.Group();
    forksGroup.position.set(0, 0.3, -1.15); 
    const carriage = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 0.1), blackMat);
    forksGroup.add(carriage);
    const tineGeo = new THREE.BoxGeometry(0.12, 0.05, 1.4);
    const leftTine = new THREE.Mesh(tineGeo, blackMat); leftTine.position.set(-0.3, -0.15, -0.6);
    const rightTine = new THREE.Mesh(tineGeo, blackMat); rightTine.position.set(0.3, -0.15, -0.6);
    forksGroup.add(leftTine, rightTine);

    group.add(forksGroup);
    group.userData.forksObj = forksGroup; 
    return group;
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
        if (forklift && camera.position.distanceTo(forklift.position) < 4) {
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
        if(forklift.userData.forksObj) {
            forklift.userData.forksObj.position.y = data.forkHeight;
        }
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
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 }); 
    const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.05), eyeMat); leftEye.position.set(-0.25, 0.6, -0.51); 
    const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.05), eyeMat); rightEye.position.set(0.25, 0.6, -0.51); 
    group.add(leftEye, rightEye);
    return group;
}

function animate() {
    requestAnimationFrame(animate);
    if (!scene || !forklift) return; 

    if (isDriving) {
        // --- DRIVING MODE ---
        const speed = 10.0 * 0.016;
        const rotSpeed = 2.0 * 0.016;
        let moved = false;

        // INVERTED CONTROLS FOR DRIVING
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
        // INVERTED TURNING
        if (moveLeft) { forklift.rotation.y -= rotSpeed; moved = true; }
        if (moveRight) { forklift.rotation.y += rotSpeed; moved = true; }

        // Forks
        const forks = forklift.userData.forksObj;
        if (forkMovingUp && forks.position.y < 2.5) { forks.position.y += 0.05; moved = true; }
        if (forkMovingDown && forks.position.y > 0.1) { forks.position.y -= 0.05; moved = true; }

        // CAMERA (Seat Logic + Free Look)
        // Offset Y=1.8 (head height), Z=0.3 (slightly back from wheel)
        const seatOffset = new THREE.Vector3(0, 1.8, 0.3); 
        camera.position.copy(forklift.position).add(seatOffset);
        
        // Note: We do NOT touch camera.rotation here, allowing free mouse look.

        if (moved) {
            socket.emit('move-forklift', {
                x: forklift.position.x,
                z: forklift.position.z,
                ry: forklift.rotation.y,
                forkHeight: forks.position.y
            });
        }

    } else if (controls.isLocked) {
        // --- WALKING MODE ---
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

        // Collision Check
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
