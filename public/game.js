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

    // LIGHTING (Industrial High-Bay Style)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(12, 20, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);
    
    // GROUND
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({color: 0x333333, roughness: 0.8}));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // --- BUILD THE V2 FORKLIFT ---
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

// --- 🏗️ THE UPDATED BUILDER ---
function buildForklift() {
    forklift = new THREE.Group();
    
    // -- COLORS --
    const COLOR_BODY = 0xE6B800; // "Caterpillar" Yellow (Darker/Orange-ish)
    const COLOR_DARK = 0x222222; 
    const COLOR_STEEL = 0x888899; 

    const matBody = new THREE.MeshStandardMaterial({ color: COLOR_BODY, roughness: 0.3 });
    const matDark = new THREE.MeshStandardMaterial({ color: COLOR_DARK, roughness: 0.8 });
    const matSteel = new THREE.MeshStandardMaterial({ color: COLOR_STEEL, roughness: 0.3, metalness: 0.6 });
    const matTank = new THREE.MeshStandardMaterial({ color: 0xEEEEEE });

    // 1. CHASSIS (SQUARE BACK)
    const chassisGroup = new THREE.Group();
    
    // Main Body Block
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.8), matBody);
    body.position.set(0, 0.9, 0.2);
    body.castShadow = true;
    chassisGroup.add(body);

    // The Counterweight (Heavy Block at the back)
    // Removed the cylinder, added a chamfered-looking block
    const cw = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.6), matBody);
    cw.position.set(0, 0.9, 1.2); // Stick it on the back
    chassisGroup.add(cw);
    
    // Floorplate
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 1.0), matDark);
    floor.position.set(0, 0.5, -0.8);
    chassisGroup.add(floor);

    forklift.add(chassisGroup);

    // 2. PROPANE TANK
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.8, 16), matTank);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(0, 1.5, 1.2);
    forklift.add(tank);

    // 3. WHEELS
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 24);
    wheelGeo.rotateZ(Math.PI / 2);
    
    const wFL = new THREE.Mesh(wheelGeo, matDark); wFL.position.set(-0.75, 0.4, -0.6); forklift.add(wFL);
    const wFR = new THREE.Mesh(wheelGeo, matDark); wFR.position.set(0.75, 0.4, -0.6); forklift.add(wFR);
    
    const wRL = new THREE.Mesh(wheelGeo, matDark); wRL.position.set(-0.75, 0.4, 1.2); forklift.add(wRL);
    const wRR = new THREE.Mesh(wheelGeo, matDark); wRR.position.set(0.75, 0.4, 1.2); forklift.add(wRR);

    // 4. ROLL CAGE
    const cageGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8);
    const cFL = new THREE.Mesh(cageGeo, matDark); cFL.position.set(-0.65, 2.0, -0.5); forklift.add(cFL);
    const cFR = new THREE.Mesh(cageGeo, matDark); cFR.position.set(0.65, 2.0, -0.5); forklift.add(cFR);
    const cRL = new THREE.Mesh(cageGeo, matDark); cRL.position.set(-0.65, 2.0, 1.0); forklift.add(cRL);
    const cRR = new THREE.Mesh(cageGeo, matDark); cRR.position.set(0.65, 2.0, 1.0); forklift.add(cRR);

    // Roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 1.6), matDark);
    roof.position.set(0, 3.1, 0.25);
    forklift.add(roof);

    // 5. INTERIOR
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6), new THREE.MeshStandardMaterial({color: 0x111111}));
    seat.position.set(0, 1.1, 0.2);
    forklift.add(seat);
    
    const steering = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6), matDark);
    steering.position.set(0, 1.5, -0.4);
    steering.rotation.x = 0.5;
    forklift.add(steering);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 16), matDark);
    wheel.position.set(0, 1.8, -0.55);
    wheel.rotation.x = 0.5;
    forklift.add(wheel);


    // 6. MAST
    const mastGeo = new THREE.BoxGeometry(0.1, 3.0, 0.15);
    const mL = new THREE.Mesh(mastGeo, matSteel); mL.position.set(-0.4, 1.8, -1.0); forklift.add(mL);
    const mR = new THREE.Mesh(mastGeo, matSteel); mR.position.set(0.4, 1.8, -1.0); forklift.add(mR);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.1), matDark); cross.position.set(0, 3.2, -1.0); forklift.add(cross);

    // 7. FORKS (FIXED: POINTING FORWARD)
    forksPart = new THREE.Group();
    
    // Back Plate (The part that slides up/down)
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.1), matDark);
    plate.position.set(0, 0, 0); 
    forksPart.add(plate);

    // Tines (The actual forks) - Rotated to point FORWARD (-Z)
    const tineGeo = new THREE.BoxGeometry(0.1, 0.05, 1.2);
    
    const tL = new THREE.Mesh(tineGeo, matDark); 
    tL.position.set(-0.3, -0.25, -0.6); // Negative Z means "In front of the plate"
    forksPart.add(tL);

    const tR = new THREE.Mesh(tineGeo, matDark); 
    tR.position.set(0.3, -0.25, -0.6); // Negative Z means "In front of the plate"
    forksPart.add(tR);

    // Vertical part of the fork (Heel)
    const heelGeo = new THREE.BoxGeometry(0.1, 0.5, 0.05);
    const hL = new THREE.Mesh(heelGeo, matDark); hL.position.set(-0.3, 0, -0.05); forksPart.add(hL);
    const hR = new THREE.Mesh(heelGeo, matDark); hR.position.set(0.3, 0, -0.05); forksPart.add(hR);

    // Attach to mast
    forksPart.position.set(0, 0.5, -1.1);
    forklift.add(forksPart);

    scene.add(forklift);
}

function loadGameWorld(data) {
    if (!forklift) return;

    forklift.position.set(data.forklift.x, data.forklift.y, data.forklift.z);
    forklift.rotation.y = data.forklift.ry;
    currentDriverId = data.forklift.driverId;
    
    if (forksPart) {
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
        forklift.position.x += (data.x - forklift.position.x) * 0.2;
        forklift.position.z += (data.z - forklift.position.z) * 0.2;
        forklift.rotation.y = data.ry;
        
        if(forksPart) {
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
            // Limits: 0.5 (Floor) to 3.0 (Top)
            if (forkMovingUp && forksPart.position.y < 3.0) { 
                forksPart.position.y += 0.05; 
                moved = true; 
            }
            if (forkMovingDown && forksPart.position.y > 0.5) { 
                forksPart.position.y -= 0.05; 
                moved = true; 
            }
        }

        const seatOffset = new THREE.Vector3(0, 3.2, 0.0); 
        camera.position.copy(forklift.position).add(seatOffset);
        
        if (moved) {
            socket.emit('move-forklift', {
                x: forklift.position.x,
                z: forklift.position.z,
                ry: forklift.rotation.y,
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
