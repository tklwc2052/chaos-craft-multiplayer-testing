const socket = io();
let scene, camera, renderer, controls;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, isShifting = false;
let forkMovingUp = false, forkMovingDown = false;
let velocity = new THREE.Vector3(), direction = new THREE.Vector3();
let otherPlayers = {}; 

// GAME VARIABLES
const GRAVITY = 24.0; 
const JUMP_FORCE = 10.0; 
let canJump = false;
let lastSentPos = { x: 0, y: 0, z: 0, ry: 0 };

// FORKLIFT VARIABLES
let forklift = null;       // The whole vehicle group
let forksPart = null;      // The specific moving part
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
    scene.fog = new THREE.Fog(0x87ceeb, 10, 80);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.rotation.order = 'YXZ';

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; 
    renderer.outputEncoding = THREE.sRGBEncoding; 
    document.body.appendChild(renderer.domElement);

    controls = new THREE.PointerLockControls(camera, document.body);
    camera.position.set(0, 5, 10);
    
    document.addEventListener('click', () => {
        controls.lock();
    });

    // LIGHTING
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(20, 30, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);
    
    // GROUND
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({color: 0x567d46}));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // --- BUILD THE FORKLIFT IN CODE ---
    buildForklift();

    // Inputs
    window.addEventListener('keydown', (e) => {
        if(e.code==='KeyW') moveForward=true; 
        if(e.code==='KeyS') moveBackward=true;
        if(e.code==='KeyA') moveLeft=true; 
        if(e.code==='KeyD') moveRight=true;
        if(e.shiftKey) isShifting = true;
        if(e.code==='Space' && !isDriving && canJump) { velocity.y = JUMP_FORCE; canJump = false; }
        
        if(e.code === 'KeyE') attemptToggleDrive();
        
        // Fork Controls
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

// --- 🏗️ THE BUILDER FUNCTION ---
function buildForklift() {
    forklift = new THREE.Group();
    
    // MATERIALS
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xFFAA00 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const greyMat = new THREE.MeshStandardMaterial({ color: 0x555555 });

    // 1. CHASSIS (Main Body)
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 3), yellowMat);
    chassis.position.y = 1.0; // Lift off ground for wheels
    chassis.castShadow = true;
    forklift.add(chassis);

    // 2. CABIN (Top Cage)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 1.5), new THREE.MeshStandardMaterial({ color: 0x333333, wireframe: false, transparent: true, opacity: 0.7 }));
    cabin.position.set(0, 2.25, 0.5);
    forklift.add(cabin);

    // 3. WHEELS (4 Cylinders)
    const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16);
    wheelGeo.rotateZ(Math.PI / 2); // Flip to correct orientation
    
    const w1 = new THREE.Mesh(wheelGeo, blackMat); w1.position.set(-1.1, 0.5, 1); forklift.add(w1);
    const w2 = new THREE.Mesh(wheelGeo, blackMat); w2.position.set(1.1, 0.5, 1); forklift.add(w2);
    const w3 = new THREE.Mesh(wheelGeo, blackMat); w3.position.set(-1.1, 0.5, -1); forklift.add(w3);
    const w4 = new THREE.Mesh(wheelGeo, blackMat); w4.position.set(1.1, 0.5, -1); forklift.add(w4);

    // 4. MAST (The vertical rails at the front)
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.5, 0.2), greyMat);
    mast.position.set(0, 2.0, -1.6); // Front of the car
    forklift.add(mast);

    // 5. THE FORKS (This is the moving part!)
    forksPart = new THREE.Group();
    
    // The plate holding the forks
    const liftPlate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.2), blackMat);
    forksPart.add(liftPlate);

    // The two prongs
    const prongGeo = new THREE.BoxGeometry(0.2, 0.1, 1.5);
    const leftProng = new THREE.Mesh(prongGeo, blackMat);
    leftProng.position.set(-0.4, -0.2, -0.7);
    forksPart.add(leftProng);

    const rightProng = new THREE.Mesh(prongGeo, blackMat);
    rightProng.position.set(0.4, -0.2, -0.7);
    forksPart.add(rightProng);

    // Initial Position of Forks relative to the forklift
    forksPart.position.set(0, 0.5, -1.8); 
    forklift.add(forksPart);

    scene.add(forklift);
}

function loadGameWorld(data) {
    if (!forklift) return;

    // Set Initial Server Positions
    forklift.position.set(data.forklift.x, data.forklift.y, data.forklift.z);
    forklift.rotation.y = data.forklift.ry;
    currentDriverId = data.forklift.driverId;
    
    if (forksPart) {
        // Map 0.0 -> 0.5 (min height) to match visual model
        forksPart.position.y = 0.5 + data.forklift.forkHeight; 
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
        if (forklift && camera.position.distanceTo(forklift.position) < 5.0) {
            socket.emit('request-drive');
        }
    }
}

// --- NETWORK ---

socket.on('init-game', (data) => {
    loadGameWorld(data);
});

socket.on('driver-status', (data) => {
    currentDriverId = data.driverId;
    if (currentDriverId === socket.id) isDriving = true;
});

socket.on('update-forklift', (data) => {
    if (!isDriving && forklift) {
        // Interpolate movement for smoothness
        forklift.position.x += (data.x - forklift.position.x) * 0.2;
        forklift.position.z += (data.z - forklift.position.z) * 0.2;
        forklift.rotation.y = data.ry;
        
        if(forksPart) {
             // 0.5 is our "Floor" for the forks relative to the car center
            forksPart.position.y += ((0.5 + data.forkHeight) - forksPart.position.y) * 0.2;
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

        if (forksPart) {
            // Limits: 0.5 (Bottom) to 3.0 (Top)
            if (forkMovingUp && forksPart.position.y < 3.0) { 
                forksPart.position.y += 0.05; 
                moved = true; 
            }
            if (forkMovingDown && forksPart.position.y > 0.5) { 
                forksPart.position.y -= 0.05; 
                moved = true; 
            }
        }

        const seatOffset = new THREE.Vector3(0, 3.5, 3.0); 
        const cameraPos = forklift.position.clone().add(seatOffset.applyAxisAngle(new THREE.Vector3(0,1,0), forklift.rotation.y));
        camera.position.copy(cameraPos);
        camera.lookAt(forklift.position.x, forklift.position.y, forklift.position.z - 5);

        if (moved) {
            socket.emit('move-forklift', {
                x: forklift.position.x,
                z: forklift.position.z,
                ry: forklift.rotation.y,
                // Send "Relative Height" (0.0 to 2.5) so server stays clean
                forkHeight: forksPart ? forksPart.position.y - 0.5 : 0 
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
