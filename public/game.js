// --- 🚨 SCHOOL DEBUGGER SYSTEM 🚨 ---
// This will print errors to the screen so you can see them without F12
window.onerror = function(message, source, lineno, colno, error) {
    const errBox = document.getElementById('debug-box') || document.createElement('div');
    errBox.id = 'debug-box';
    errBox.style.position = 'fixed';
    errBox.style.top = '0';
    errBox.style.left = '0';
    errBox.style.width = '100%';
    errBox.style.backgroundColor = 'red';
    errBox.style.color = 'white';
    errBox.style.zIndex = '999999';
    errBox.style.padding = '10px';
    errBox.style.fontFamily = 'monospace';
    errBox.innerHTML += `ERROR: ${message} <br> (Line: ${lineno})<br><br>`;
    document.body.appendChild(errBox);
};

// --- WAIT FOR PAGE LOAD ---
window.onload = function() {

    // 1. CHECK DEPENDENCIES
    if (typeof THREE === 'undefined') {
        throw new Error("Three.js is not loaded! Check your HTML script tags.");
    }
    if (typeof io === 'undefined') {
        throw new Error("Socket.io is not loaded! Check your HTML script tags.");
    }
    // Check for PointerLockControls (common issue)
    if (typeof THREE.PointerLockControls === 'undefined') {
        // Fallback: We will construct a simple controller manually later if needed
        console.warn("PointerLockControls missing. Using basic fallback.");
    }

    // --- GAME VARIABLES ---
    const socket = io();
    let scene, camera, renderer, controls;
    let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, isShifting = false;
    let forkMovingUp = false, forkMovingDown = false;
    let velocity = new THREE.Vector3(), direction = new THREE.Vector3();
    let otherPlayers = {}; 

    const GRAVITY = 24.0; 
    const JUMP_FORCE = 10.0; 
    let canJump = false;
    let lastSentPos = { x: 0, y: 0, z: 0, ry: 0 };

    // FORKLIFT VARIABLES
    let forklift = null;       
    let forksPart = null;      
    let isDriving = false;
    let currentDriverId = null;

    // --- JOIN BUTTON LOGIC ---
    const startBtn = document.getElementById('startBtn');
    if (!startBtn) {
        throw new Error("Could not find button with id='startBtn' in your HTML.");
    }

    startBtn.addEventListener('click', () => {
        console.log("Join button clicked...");
        const nameInput = document.getElementById('usernameInput');
        const name = nameInput ? nameInput.value : "Player";
        
        // Hide Login / Show UI
        const loginDiv = document.getElementById('login');
        if(loginDiv) loginDiv.style.display = 'none';
        
        const uiDiv = document.getElementById('ui');
        if(uiDiv) uiDiv.style.display = 'block';

        const nameDisplay = document.getElementById('userNameDisplay');
        if(nameDisplay) nameDisplay.innerText = name;
        
        // Start 3D
        try {
            init3D();
            socket.emit('join', { username: name });
        } catch(e) {
            throw new Error("Crash during Init3D: " + e.message);
        }
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

        // --- CONTROLS SETUP (SAFE MODE) ---
        if (typeof THREE.PointerLockControls !== 'undefined') {
            controls = new THREE.PointerLockControls(camera, document.body);
            document.addEventListener('click', () => { controls.lock(); });
        } else {
            // MANUAL FALLBACK CONTROLS (If school blocked the script)
            controls = { isLocked: false };
            alert("Warning: PointerLockControls script missing. Click to capture mouse (Fallback mode).");
            
            document.body.requestPointerLock = document.body.requestPointerLock || document.body.mozRequestPointerLock;
            document.addEventListener('click', () => { document.body.requestPointerLock(); });
            
            document.addEventListener('pointerlockchange', () => {
                controls.isLocked = (document.pointerLockElement === document.body);
            });
            
            document.addEventListener('mousemove', (event) => {
                if (controls.isLocked) {
                    camera.rotation.y -= event.movementX * 0.002;
                    camera.rotation.x -= event.movementY * 0.002;
                    camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, camera.rotation.x));
                }
            });
            // Add dummy move functions for the physics loop
            controls.moveRight = function(dist) { camera.translateX(dist); };
            controls.moveForward = function(dist) { camera.translateZ(dist); };
        }

        camera.position.set(5, 5, 10);
        camera.lookAt(0, 0, 0);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
        dirLight.position.set(12, 20, 8);
        dirLight.castShadow = true;
        scene.add(dirLight);
        
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({color: 0x333333, roughness: 0.8}));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        // --- BUILD THE FORKLIFT (V14 Model) ---
        buildForklift();

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

    // --- 🏗️ THE BUILDER (V14 - Stealth Spec) ---
    function buildForklift() {
        forklift = new THREE.Group();
        
        const COLOR_BODY = 0xE6B800; 
        const COLOR_DARK = 0x222222; 
        const COLOR_IRON = 0x333333; 
        const COLOR_STEEL = 0xAAAAAA; 
        const COLOR_CAGE = 0x050505; 
        const COLOR_CHAIN = 0x111111;
        const COLOR_SEAT = 0x111111; 
        const COLOR_TANK_GREY = 0x999999; 

        const matBody = new THREE.MeshStandardMaterial({ color: COLOR_BODY, roughness: 0.3, side: THREE.DoubleSide });
        const matDark = new THREE.MeshStandardMaterial({ color: COLOR_DARK, roughness: 0.8 });
        const matIron = new THREE.MeshStandardMaterial({ color: COLOR_IRON, roughness: 0.7, metalness: 0.4 });
        const matSteel = new THREE.MeshStandardMaterial({ color: COLOR_STEEL, roughness: 0.3, metalness: 0.6 });
        const matCage = new THREE.MeshStandardMaterial({ color: COLOR_CAGE, roughness: 0.4 });
        const matChain = new THREE.MeshStandardMaterial({ color: COLOR_CHAIN, roughness: 0.9 });
        const matSeat = new THREE.MeshStandardMaterial({ color: COLOR_SEAT, roughness: 0.9 });
        const matTank = new THREE.MeshStandardMaterial({ color: COLOR_TANK_GREY, roughness: 0.4 });

        const chassisGroup = new THREE.Group();
        
        const rearBlock = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), matBody);
        rearBlock.position.set(0, 0.85, 0.8); rearBlock.castShadow = true; chassisGroup.add(rearBlock);

        const cwBox = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.5), matBody); cwBox.position.set(0, 0.95, 1.35); chassisGroup.add(cwBox);
        const cornerGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.9, 16);
        const cL = new THREE.Mesh(cornerGeo, matBody); cL.position.set(-0.4, 0.95, 1.35); chassisGroup.add(cL);
        const cR = new THREE.Mesh(cornerGeo, matBody); cR.position.set(0.4, 0.95, 1.35); chassisGroup.add(cR);

        const frontCowling = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 0.5), matBody);
        frontCowling.position.set(0, 0.8, -0.6); frontCowling.castShadow = true; chassisGroup.add(frontCowling);

        const floor = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 1.0), matBody);
        floor.position.set(0, 0.45, 0.1); chassisGroup.add(floor);

        const archGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 32, 1, true, 0, Math.PI);
        const fFL = new THREE.Mesh(archGeo, matBody); fFL.rotation.z = Math.PI/2; fFL.position.set(-0.55, 0.4, -0.5); chassisGroup.add(fFL);
        const fFR = new THREE.Mesh(archGeo, matBody); fFR.rotation.z = Math.PI/2; fFR.position.set(0.55, 0.4, -0.5); chassisGroup.add(fFR);

        const boxFenderGeo = new THREE.BoxGeometry(0.3, 0.1, 0.8);
        const fRL = new THREE.Mesh(boxFenderGeo, matBody); fRL.position.set(-0.55, 0.7, 0.8); chassisGroup.add(fRL);
        const fRR = new THREE.Mesh(boxFenderGeo, matBody); fRR.position.set(0.55, 0.7, 0.8); chassisGroup.add(fRR);

        const stepGeo = new THREE.BoxGeometry(0.3, 0.05, 0.8);
        const sL = new THREE.Mesh(stepGeo, matBody); sL.position.set(-0.55, 0.4, -0.1); chassisGroup.add(sL);
        const sR = new THREE.Mesh(stepGeo, matBody); sR.position.set(0.55, 0.4, -0.1); chassisGroup.add(sR);

        const rampGeo = new THREE.BoxGeometry(0.3, 0.05, 0.55);
        const rL = new THREE.Mesh(rampGeo, matBody); rL.position.set(-0.55, 0.55, 0.45); rL.rotation.x = -0.6; chassisGroup.add(rL);
        const rR = new THREE.Mesh(rampGeo, matBody); rR.position.set(0.55, 0.55, 0.45); rR.rotation.x = -0.6; chassisGroup.add(rR);

        const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 2.0), matDark); base.position.set(0, 0.4, 0.3); chassisGroup.add(base);
        forklift.add(chassisGroup);

        const tankGroup = new THREE.Group();
        tankGroup.position.set(0, 1.5, 1.2); 
        const tBody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.8, 16), matTank);
        tBody.rotation.z = Math.PI / 2; tankGroup.add(tBody);
        const strapGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.05, 16); 
        const strap1 = new THREE.Mesh(strapGeo, matDark); strap1.rotation.z = Math.PI / 2; strap1.position.x = -0.25; tankGroup.add(strap1);
        const strap2 = new THREE.Mesh(strapGeo, matDark); strap2.rotation.z = Math.PI / 2; strap2.position.x = 0.25; tankGroup.add(strap2);
        forklift.add(tankGroup);

        const wheelGeoFront = new THREE.CylinderGeometry(0.4, 0.4, 0.25, 24); wheelGeoFront.rotateZ(Math.PI / 2);
        const wheelGeoRear = new THREE.CylinderGeometry(0.28, 0.28, 0.25, 24); wheelGeoRear.rotateZ(Math.PI / 2);
        const wFL = new THREE.Mesh(wheelGeoFront, matDark); wFL.position.set(-0.55, 0.4, -0.6); forklift.add(wFL);
        const wFR = new THREE.Mesh(wheelGeoFront, matDark); wFR.position.set(0.55, 0.4, -0.6); forklift.add(wFR);
        const wRL = new THREE.Mesh(wheelGeoRear, matDark); wRL.position.set(-0.55, 0.28, 0.8); forklift.add(wRL);
        const wRR = new THREE.Mesh(wheelGeoRear, matDark); wRR.position.set(0.55, 0.28, 0.8); forklift.add(wRR);

        const cageGroup = new THREE.Group();
        const pipeGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 12);
        const pipeSideGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 12);
        const POST_Y = 1.8; const ROOF_Y = 2.6;
        const pFL = new THREE.Mesh(pipeGeo, matCage); pFL.position.set(-0.50, POST_Y, -0.5); pFL.rotation.x = 0.1; cageGroup.add(pFL);
        const pFR = new THREE.Mesh(pipeGeo, matCage); pFR.position.set(0.50, POST_Y, -0.5); pFR.rotation.x = 0.1; cageGroup.add(pFR);
        const pRL = new THREE.Mesh(pipeGeo, matCage); pRL.position.set(-0.50, POST_Y, 1.0); pRL.rotation.x = -0.1; cageGroup.add(pRL);
        const pRR = new THREE.Mesh(pipeGeo, matCage); pRR.position.set(0.50, POST_Y, 1.0); pRR.rotation.x = -0.1; cageGroup.add(pRR);
        const rL = new THREE.Mesh(pipeSideGeo, matCage); rL.rotation.x = Math.PI/2; rL.position.set(-0.50, ROOF_Y, 0.25); cageGroup.add(rL);
        const rR = new THREE.Mesh(pipeSideGeo, matCage); rR.rotation.x = Math.PI/2; rR.position.set(0.50, ROOF_Y, 0.25); cageGroup.add(rR);
        const slatGeo = new THREE.BoxGeometry(1.0, 0.02, 0.15);
        for(let i=0; i<5; i++) { 
            const slat = new THREE.Mesh(slatGeo, matCage); slat.position.set(0, ROOF_Y + 0.02, -0.3 + (i * 0.25)); slat.rotation.x = 0.2; cageGroup.add(slat);
        }
        forklift.add(cageGroup);

        const steering = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6), matDark); steering.position.set(0, 1.4, -0.4); steering.rotation.x = 0.5; forklift.add(steering);
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 8, 16), matDark); wheel.position.set(0, 1.7, -0.55); wheel.rotation.x = 0.5; forklift.add(wheel);
        const seatGroup = new THREE.Group();
        const sBot = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.6), matSeat); sBot.position.set(0, 0, 0); seatGroup.add(sBot);
        const sBack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.1), matSeat); sBack.position.set(0, 0.35, 0.3); sBack.rotation.x = -0.15; seatGroup.add(sBack);
        seatGroup.position.set(0, 1.25, 0.6); forklift.add(seatGroup);

        const mastGroup = new THREE.Group();
        const mastGeo = new THREE.BoxGeometry(0.1, 2.8, 0.15);
        const mL = new THREE.Mesh(mastGeo, matSteel); mL.position.set(-0.35, 1.6, -0.9); mastGroup.add(mL);
        const mR = new THREE.Mesh(mastGeo, matSteel); mR.position.set(0.35, 1.6, -0.9); mastGroup.add(mR);
        const cross = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.1), matDark); cross.position.set(0, 3.0, -0.9); mastGroup.add(cross);
        const hydro = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.0), matSteel); hydro.position.set(0, 1.3, -0.9); mastGroup.add(hydro);
        const chainGeo = new THREE.BoxGeometry(0.02, 2.5, 0.02);
        const chainL = new THREE.Mesh(chainGeo, matChain); chainL.position.set(-0.25, 1.6, -0.8); mastGroup.add(chainL);
        const chainR = new THREE.Mesh(chainGeo, matChain); chainR.position.set(0.25, 1.6, -0.8); mastGroup.add(chainR);
        forklift.add(mastGroup);

        forksPart = new THREE.Group();
        const upperBar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.05), matIron); upperBar.position.set(0, 0.3, 0); forksPart.add(upperBar);
        const lowerBar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.05), matIron); lowerBar.position.set(0, -0.3, 0); forksPart.add(lowerBar);
        const vBarL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.05), matIron); vBarL.position.set(-0.4, 0, 0); forksPart.add(vBarL);
        const vBarR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.05), matIron); vBarR.position.set(0.4, 0, 0); forksPart.add(vBarR);

        const gridFrame = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.05), matIron); gridFrame.position.set(0, 1.0, 0); forksPart.add(gridFrame);
        const gridBarGeo = new THREE.BoxGeometry(0.03, 1.0, 0.02);
        for(let i=-2; i<=2; i++) {
            const bar = new THREE.Mesh(gridBarGeo, matIron); bar.position.set(i * 0.15, 0.5, 0); forksPart.add(bar);
        }

        const tineGeo = new THREE.BoxGeometry(0.12, 0.04, 1.3); 
        const tL = new THREE.Mesh(tineGeo, matIron); tL.position.set(-0.35, -0.3, -0.65); forksPart.add(tL);
        const hL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.04), matIron); hL.position.set(-0.35, 0, -0.02); forksPart.add(hL);
        const tR = new THREE.Mesh(tineGeo, matIron); tR.position.set(0.35, -0.3, -0.65); forksPart.add(tR);
        const hR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.04), matIron); hR.position.set(0.35, 0, -0.02); forksPart.add(hR);

        forksPart.position.set(0, 0.5, -1.0); 
        forklift.add(forksPart);

        scene.add(forklift);
    }

    function loadGameWorld(data) {
        if (!forklift) return;
        forklift.position.set(data.forklift.x, data.forklift.y, data.forklift.z);
        forklift.rotation.y = data.forklift.ry;
        currentDriverId = data.forklift.driverId;
        if (forksPart) { forksPart.position.y = 0.5 + data.forklift.forkHeight; }
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
    socket.on('init-game', (data) => { loadGameWorld(data); });
    socket.on('driver-status', (data) => { currentDriverId = data.driverId; if (currentDriverId === socket.id) isDriving = true; });
    socket.on('update-forklift', (data) => {
        if (!isDriving && forklift) {
            forklift.position.x += (data.x - forklift.position.x) * 0.2;
            forklift.position.z += (data.z - forklift.position.z) * 0.2;
            forklift.rotation.y = data.ry;
            if(forksPart) { forksPart.position.y += ((0.5 + data.forkHeight) - forksPart.position.y) * 0.2; }
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
    socket.on('player-left', (id) => { if (otherPlayers[id]) { scene.remove(otherPlayers[id]); delete otherPlayers[id]; } });

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

            if (moveForward) { forklift.position.x += Math.sin(forklift.rotation.y) * speed; forklift.position.z += Math.cos(forklift.rotation.y) * speed; moved = true; }
            if (moveBackward) { forklift.position.x -= Math.sin(forklift.rotation.y) * speed; forklift.position.z -= Math.cos(forklift.rotation.y) * speed; moved = true; }
            if (moveLeft) { forklift.rotation.y -= rotSpeed; moved = true; }
            if (moveRight) { forklift.rotation.y += rotSpeed; moved = true; }

            if (forksPart) {
                if (forkMovingUp && forksPart.position.y < 3.0) { forksPart.position.y += 0.05; moved = true; }
                if (forkMovingDown && forksPart.position.y > 0.5) { forksPart.position.y -= 0.05; moved = true; }
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
        } else if (controls && controls.isLocked) {
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

            if (camera.position.y < targetHeight) { velocity.y = 0; camera.position.y = targetHeight; canJump = true; }

            if (Math.abs(camera.position.x - lastSentPos.x) > 0.1 || Math.abs(camera.position.z - lastSentPos.z) > 0.1) {
                socket.emit('move', { x: camera.position.x, y: camera.position.y, z: camera.position.z, ry: camera.rotation.y });
                lastSentPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z, ry: camera.rotation.y };
            }
        }
        renderer.render(scene, camera);
    }
};
