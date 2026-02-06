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

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.rotation.order = 'YXZ';

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; 
    renderer.outputEncoding = THREE.sRGBEncoding; 
    document.body.appendChild(renderer.domElement);

    controls = new THREE.PointerLockControls(camera, document.body);
    camera.position.set(5, 5, 10);
    
    document.addEventListener('click', () => {
        controls.lock();
    });

    // LIGHTING (Studio Setup for Shiny Metal)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(15, 25, 15);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xffaa00, 0.3); // Warm sun fill
    fillLight.position.set(-10, 10, -10);
    scene.add(fillLight);
    
    // GROUND
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({color: 0x567d46, roughness: 0.8}));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // --- BUILD THE ULTIMATE FORKLIFT ---
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

// --- 🏗️ THE ULTIMATE BUILDER FUNCTION ---
function buildForklift() {
    forklift = new THREE.Group();
    
    // -- PRO MATERIALS --
    const matBody = new THREE.MeshStandardMaterial({ color: 0xFFA500, roughness: 0.2, metalness: 0.1 }); // Shiny Orange
    const matDark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }); // Rubber/Plastic
    const matMetal = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.7 }); // Chrome/Steel
    const matSeat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }); // Leather
    const matGlass = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.3, roughness: 0.0 });
    const matLightRed = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const matLightWhite = new THREE.MeshBasicMaterial({ color: 0xffffaa });

    // 1. CHASSIS (Rounded Back)
    const chassisGroup = new THREE.Group();
    
    // Main Floor
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 2.2), matBody);
    floor.position.y = 0.6;
    chassisGroup.add(floor);

    // Rounded Counterweight (The back part)
    const counterWeight = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.4, 32), matBody);
    counterWeight.rotation.z = Math.PI / 2;
    counterWeight.position.set(0, 1.1, 0.8);
    chassisGroup.add(counterWeight);

    // Side Panels
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 1.4), matBody); sideL.position.set(-0.6, 1.0, 0.0); chassisGroup.add(sideL);
    const sideR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 1.4), matBody); sideR.position.set(0.6, 1.0, 0.0); chassisGroup.add(sideR);

    // Rear Lights
    const tailLightL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), matLightRed); tailLightL.position.set(-0.5, 1.2, 1.45); chassisGroup.add(tailLightL);
    const tailLightR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), matLightRed); tailLightR.position.set(0.5, 1.2, 1.45); chassisGroup.add(tailLightR);

    forklift.add(chassisGroup);

    // 2. WHEELS (Detailed)
    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 24);
    wheelGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.36, 16);
    hubGeo.rotateZ(Math.PI / 2);

    function makeWheel(x, y, z) {
        const w = new THREE.Group();
        const tire = new THREE.Mesh(wheelGeo, matDark);
        const hub = new THREE.Mesh(hubGeo, matMetal);
        w.add(tire);
        w.add(hub);
        w.position.set(x, y, z);
        return w;
    }

    forklift.add(makeWheel(-0.75, 0.45, -0.8)); // Front L
    forklift.add(makeWheel(0.75, 0.45, -0.8));  // Front R
    forklift.add(makeWheel(-0.75, 0.45, 0.8));  // Rear L
    forklift.add(makeWheel(0.75, 0.45, 0.8));   // Rear R

    // 3. ROLL CAGE (Angled Supports)
    const cage = new THREE.Group();
    const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.4, 8);
    
    // Front Pillars
    const pFL = new THREE.Mesh(poleGeo, matDark); pFL.position.set(-0.6, 2.0, -0.6); cage.add(pFL);
    const pFR = new THREE.Mesh(poleGeo, matDark); pFR.position.set(0.6, 2.0, -0.6); cage.add(pFR);

    // Rear Pillars (Angled)
    const pRL = new THREE.Mesh(poleGeo, matDark); pRL.position.set(-0.6, 2.0, 0.9); pRL.rotation.x = -0.1; cage.add(pRL);
    const pRR = new THREE.Mesh(poleGeo, matDark); pRR.position.set(0.6, 2.0, 0.9); pRR.rotation.x = -0.1; cage.add(pRR);

    // Roof Frame
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 1.6), matDark);
    roof.position.set(0, 3.2, 0.15);
    cage.add(roof);

    // Glass Roof
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 1.4), matGlass);
    glass.position.set(0, 3.22, 0.15);
    cage.add(glass);

    // Headlights
    const headL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.05, 0.2), matDark); headL.rotation.x = Math.PI/2; headL.position.set(-0.65, 3.1, -0.6); cage.add(headL);
    const bulbL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.01, 0.05), matLightWhite); bulbL.rotation.x = Math.PI/2; bulbL.position.set(-0.65, 3.1, -0.7); cage.add(bulbL);
    
    const headR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.05, 0.2), matDark); headR.rotation.x = Math.PI/2; headR.position.set(0.65, 3.1, -0.6); cage.add(headR);
    const bulbR = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.01, 0.05), matLightWhite); bulbR.rotation.x = Math.PI/2; bulbR.position.set(0.65, 3.1, -0.7); cage.add(bulbR);

    forklift.add(cage);

    // 4. CABIN INTERIOR
    const seat = new THREE.Group();
    const sBase = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.7), matSeat); sBase.position.y = 1.0; 
    const sBack = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.15), matSeat); sBack.position.set(0, 1.4, 0.35); sBack.rotation.x = -0.1;
    seat.add(sBase); seat.add(sBack);
    seat.position.set(0, 0, 0.4);
    forklift.add(seat);

    // Dashboard
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.3), matDark);
    dash.position.set(0, 1.3, -0.4);
    dash.rotation.x = 0.5;
    forklift.add(dash);

    // Steering Wheel
    const swCol = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5), matDark);
    swCol.position.set(0, 1.5, -0.5); swCol.rotation.x = 0.5;
    forklift.add(swCol);
    const swRing = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.04, 8, 24), matDark);
    swRing.position.set(0, 1.7, -0.6); swRing.rotation.x = 0.5;
    forklift.add(swRing);

    // Levers
    const lever1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4), matMetal); lever1.position.set(0.3, 1.6, -0.3); lever1.rotation.x = 0.2; forklift.add(lever1);
    const lever2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4), matMetal); lever2.position.set(0.4, 1.6, -0.3); lever2.rotation.x = -0.2; forklift.add(lever2);


    // 5. HYDRAULIC MAST SYSTEM
    const mastGroup = new THREE.Group();
    
    // Outer Rails (Fixed)
    const railGeo = new THREE.BoxGeometry(0.1, 3.5, 0.15);
    const railL = new THREE.Mesh(railGeo, matMetal); railL.position.set(-0.4, 2.0, -1.2); mastGroup.add(railL);
    const railR = new THREE.Mesh(railGeo, matMetal); railR.position.set(0.4, 2.0, -1.2); mastGroup.add(railR);
    
    // Top Crossbar
    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 0.1), matMetal); cross.position.set(0, 3.7, -1.2); mastGroup.add(cross);

    // Central Hydraulic Cylinder (Visual)
    const hydro = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.0), matDark);
    hydro.position.set(0, 1.5, -1.15);
    mastGroup.add(hydro);
    const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.0), matMetal);
    piston.position.set(0, 2.5, -1.15);
    mastGroup.add(piston);

    forklift.add(mastGroup);

    // 6. MOVING FORKS
    forksPart = new THREE.Group();
    
    // Carriage Plate
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.1), matDark);
    plate.position.set(0, 0, 0);
    forksPart.add(plate);

    // Fork Tines
    const tineH = new THREE.BoxGeometry(0.12, 0.05, 1.6); // Long flat part
    const tineV = new THREE.BoxGeometry(0.12, 0.6, 0.05); // Vertical part connecting to plate

    const tL_H = new THREE.Mesh(tineH, matDark); tL_H.position.set(-0.3, -0.3, 0.8); forksPart.add(tL_H);
    const tL_V = new THREE.Mesh(tineV, matDark); tL_V.position.set(-0.3, 0.0, 0.05); forksPart.add(tL_V);

    const tR_H = new THREE.Mesh(tineH, matDark); tR_H.position.set(0.3, -0.3, 0.8); forksPart.add(tR_H);
    const tR_V = new THREE.Mesh(tineV, matDark); tR_V.position.set(0.3, 0.0, 0.05); forksPart.add(tR_V);

    // Initial Position (Attached to front of mast)
    forksPart.position.set(0, 0.6, -1.35);
    forklift.add(forksPart);

    scene.add(forklift);
}

function loadGameWorld(data) {
    if (!forklift) return;

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
        forklift.position.x += (data.x - forklift.position.x) * 0.2;
        forklift.position.z += (data.z - forklift.position.z) * 0.2;
        forklift.rotation.y = data.ry;
        
        if(forksPart) {
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
            if (forkMovingUp && forksPart.position.y < 3.0) { forksPart.position.y += 0.05; moved = true; }
            if (forkMovingDown && forksPart.position.y > 0.6) { forksPart.position.y -= 0.05; moved = true; }
        }

        // Camera Lock (Slightly further back to see the whole model)
        const seatOffset = new THREE.Vector3(0, 3.5, 3.5); 
        const cameraPos = forklift.position.clone().add(seatOffset.applyAxisAngle(new THREE.Vector3(0,1,0), forklift.rotation.y));
        camera.position.copy(cameraPos);
        camera.lookAt(forklift.position.x, forklift.position.y + 1, forklift.position.z);

        if (moved) {
            socket.emit('move-forklift', {
                x: forklift.position.x,
                z: forklift.position.z,
                ry: forklift.rotation.y,
                forkHeight: forksPart ? forksPart.position.y - 0.6 : 0 
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
