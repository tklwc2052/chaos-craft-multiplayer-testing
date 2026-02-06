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
let forklift = null;       
let forksPart = null;      
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

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.rotation.order = 'YXZ';

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; 
    renderer.outputEncoding = THREE.sRGBEncoding; 
    document.body.appendChild(renderer.domElement);

    controls = new THREE.PointerLockControls(camera, document.body);
    camera.position.set(5, 5, 10);
    camera.lookAt(0, 0, 0);
    
    document.addEventListener('click', () => {
        controls.lock();
    });

    // LIGHTING (Improved for better shadows on the new model)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);
    
    // GROUND
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({color: 0x567d46}));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // --- BUILD THE HD FORKLIFT ---
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

// --- 🏗️ THE HIGH-DETAIL BUILDER ---
function buildForklift() {
    forklift = new THREE.Group();
    
    // -- PALETTE --
    const bodyColor = 0xFFA500; // Safety Orange/Yellow
    const darkColor = 0x222222; // Dark Grey (Tires/Cage)
    const metalColor = 0x888888; // Silver (Mast)
    
    const matBody = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.3 });
    const matDark = new THREE.MeshStandardMaterial({ color: darkColor, roughness: 0.9 });
    const matMetal = new THREE.MeshStandardMaterial({ color: metalColor, roughness: 0.4, metalness: 0.6 });
    const matSeat = new THREE.MeshStandardMaterial({ color: 0x111111 });

    // 1. CHASSIS (The heavy base)
    // Main slab
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.8), matBody);
    base.position.y = 0.6; // Lifted for wheels
    base.castShadow = true;
    forklift.add(base);

    // Engine Cover / Counterweight (The bulky back part)
    const rear = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.2), matBody);
    rear.position.set(0, 1.2, 0.8);
    rear.castShadow = true;
    forklift.add(rear);

    // 2. WHEELS (Front are bigger)
    const wheelGeoF = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 24);
    wheelGeoF.rotateZ(Math.PI / 2);
    const wheelGeoR = new THREE.CylinderGeometry(0.35, 0.35, 0.4, 24);
    wheelGeoR.rotateZ(Math.PI / 2);

    // Front Wheels
    const wf1 = new THREE.Mesh(wheelGeoF, matDark); wf1.position.set(-0.9, 0.5, -0.8); forklift.add(wf1);
    const wf2 = new THREE.Mesh(wheelGeoF, matDark); wf2.position.set(0.9, 0.5, -0.8); forklift.add(wf2);
    
    // Rear Wheels
    const wr1 = new THREE.Mesh(wheelGeoR, matDark); wr1.position.set(-0.9, 0.35, 1.0); forklift.add(wr1);
    const wr2 = new THREE.Mesh(wheelGeoR, matDark); wr2.position.set(0.9, 0.35, 1.0); forklift.add(wr2);

    // 3. ROLL CAGE (The Bars)
    const barGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8);
    
    // Front Bars
    const barFL = new THREE.Mesh(barGeo, matDark); barFL.position.set(-0.7, 2.0, -0.6); forklift.add(barFL);
    const barFR = new THREE.Mesh(barGeo, matDark); barFR.position.set(0.7, 2.0, -0.6); forklift.add(barFR);
    
    // Rear Bars
    const barRL = new THREE.Mesh(barGeo, matDark); barRL.position.set(-0.7, 2.0, 0.8); forklift.add(barRL);
    const barRR = new THREE.Mesh(barGeo, matDark); barRR.position.set(0.7, 2.0, 0.8); forklift.add(barRR);

    // Roof Grid
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 1.6), matDark);
    roof.position.set(0, 3.1, 0.1);
    forklift.add(roof);

    // 4. INTERIOR (Seat & Steering)
    // Seat
    const seatBottom = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.8), matSeat);
    seatBottom.position.set(0, 1.0, 0.2);
    forklift.add(seatBottom);
    
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.2), matSeat);
    seatBack.position.set(0, 1.4, 0.6);
    forklift.add(seatBack);

    // Steering Column & Wheel
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8), matDark);
    col.position.set(0, 1.5, -0.4);
    col.rotation.x = -0.5;
    forklift.add(col);

    const sWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16), matSeat);
    sWheel.position.set(0, 1.9, -0.55);
    sWheel.rotation.x = 1.0;
    forklift.add(sWheel);

    // 5. THE MAST (Static Rails)
    const mastGeo = new THREE.BoxGeometry(0.15, 3.5, 0.15);
    const mastL = new THREE.Mesh(mastGeo, matMetal); mastL.position.set(-0.5, 2.0, -1.4); forklift.add(mastL);
    const mastR = new THREE.Mesh(mastGeo, matMetal); mastR.position.set(0.5, 2.0, -1.4); forklift.add(mastR);
    
    // Crossbar
    const crossBar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.1), matMetal);
    crossBar.position.set(0, 3.5, -1.4);
    forklift.add(crossBar);


    // 6. THE FORKS (Moving Part)
    forksPart = new THREE.Group();
    
    // The Carriage (Horizontal plate)
    const carriage = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.1), matDark);
    carriage.castShadow = true;
    forksPart.add(carriage);

    // The Tines (L-Shape)
    const tineGeoV = new THREE.BoxGeometry(0.15, 0.8, 0.05);
    const tineGeoH = new THREE.BoxGeometry(0.15, 0.05, 1.5);

    // Left Tine
    const lV = new THREE.Mesh(tineGeoV, matDark); lV.position.set(-0.3, -0.2, 0.1); forksPart.add(lV);
    const lH = new THREE.Mesh(tineGeoH, matDark); lH.position.set(-0.3, -0.6, 0.8); forksPart.add(lH);

    // Right Tine
    const rV = new THREE.Mesh(tineGeoV, matDark); rV.position.set(0.3, -0.2, 0.1); forksPart.add(rV);
    const rH = new THREE.Mesh(tineGeoH, matDark); rH.position.set(0.3, -0.6, 0.8); forksPart.add(rH);

    // Initial Position relative to forklift center
    // X=0, Y=0.5 (near ground), Z=-1.55 (in front of mast)
    forksPart.position.set(0, 0.6, -1.55); 
    forklift.add(forksPart);

    scene.add(forklift);
}

function loadGameWorld(data) {
    if (!forklift) return;

    // Apply server data
    forklift.position.set(data.forklift.x, data.forklift.y, data.forklift.z);
    forklift.rotation.y = data.forklift.ry;
    currentDriverId = data.forklift.driverId;
    
    if (forksPart) {
        forksPart.position.y = 0.6 + data.forklift.forkHeight; 
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
        // Smooth Interpolation
        forklift.position.x += (data.x - forklift.position.x) * 0.2;
        forklift.position.z += (data.z - forklift.position.z) * 0.2;
        forklift.rotation.y = data.ry;
        
        if(forksPart) {
            // 0.6 is our base height offset
            forksPart.position.y += ((0.6 + data.forkHeight) - forksPart.position.y) * 0.2;
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
            // Visual Limit: 0.6 (Floor) to 3.0 (Top)
            if (forkMovingUp && forksPart.position.y < 3.0) { 
                forksPart.position.y += 0.05; 
                moved = true; 
            }
            if (forkMovingDown && forksPart.position.y > 0.6) { 
                forksPart.position.y -= 0.05; 
                moved = true; 
            }
        }

        // Camera locked to seat
        const seatOffset = new THREE.Vector3(0, 2.8, 0.0); 
        camera.position.copy(forklift.position).add(seatOffset);
        
        // Optional: Make camera look slightly forward relative to car
        // camera.lookAt(
        //     forklift.position.x + Math.sin(forklift.rotation.y) * 10,
        //     forklift.position.y,
        //     forklift.position.z + Math.cos(forklift.rotation.y) * 10
        // );

        if (moved) {
            socket.emit('move-forklift', {
                x: forklift.position.x,
                z: forklift.position.z,
                ry: forklift.rotation.y,
                forkHeight: forksPart ? forksPart.position.y - 0.6 : 0 // Normalize to 0
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
