const socket = io();
let scene, camera, renderer, controls, raycaster;
let sun, ambientLight, stars;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, isShifting = false;
let velocity = new THREE.Vector3(), direction = new THREE.Vector3();
let otherPlayers = {}, treeMeshes = {}, treeData = [], coins = 100;

// Game State
let logs = 0, saplings = 0, lumberReadyCount = 0, selectedSlot = 1;
const REACH_DISTANCE = 5.0, GRAVITY = 24.0, JUMP_FORCE = 10.0;
let canJump = false, lastSentPos = { x: 0, y: 0, z: 0, ry: 0 };

// Animation
let activeLogsOnBelt = [];

document.getElementById('startBtn').addEventListener('click', () => {
    document.getElementById('login').style.display = 'none';
    document.getElementById('ui').style.display = 'block';
    document.getElementById('crosshair').style.display = 'block';
    init3D();
    socket.emit('join', { username: document.getElementById('usernameInput').value || "Player" });
});

function buySapling() {
    if (coins >= 20) { coins -= 20; saplings++; updateUI(); }
}

function init3D() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    camera.rotation.order = 'YXZ';
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    controls = new THREE.PointerLockControls(camera, document.body);

    raycaster = new THREE.Raycaster();
    ambientLight = new THREE.HemisphereLight(0xeeeeff, 0x777788, 1);
    scene.add(ambientLight);
    sun = new THREE.DirectionalLight(0xffffff, 1);
    scene.add(sun);

    // Starfield
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for(let i=0; i<2000; i++) starPos.push((Math.random()-0.5)*1000, Math.random()*500, (Math.random()-0.5)*1000);
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    stars = new THREE.Points(starGeo, new THREE.PointsMaterial({color: 0xffffff}));
    scene.add(stars);

    // Ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshPhongMaterial({color: 0x567d46}));
    ground.rotation.x = -Math.PI/2;
    scene.add(ground);

    // LUMBER MILL
    const mill = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 8), new THREE.MeshPhongMaterial({color: 0x882222}));
    body.position.y = 2.5;
    mill.add(body);

    const hopper = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.5, 2.5), new THREE.MeshPhongMaterial({color: 0x333333}));
    hopper.position.set(6, 0.25, 0);
    hopper.userData.isHopper = true;
    mill.add(hopper);

    const pallet = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 3), new THREE.MeshPhongMaterial({color: 0xdeb887}));
    pallet.position.set(-6, 0.1, 0);
    pallet.userData.isPallet = true;
    mill.add(pallet);
    
    // Belt Mesh
    const belt = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.2, 1), new THREE.MeshPhongMaterial({color: 0x111111}));
    belt.position.set(4, 0.5, 0);
    mill.add(belt);

    mill.position.set(0,0,0);
    scene.add(mill);

    // Interaction
    document.addEventListener('mousedown', (e) => {
        if (!controls.isLocked) { controls.lock(); return; }
        if (e.button === 0) {
            if (selectedSlot === 1) checkTreeClick();
            if (selectedSlot === 3) checkMillInteraction();
        }
        if (e.button === 2 && selectedSlot === 2) placeSapling();
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === '1') { selectedSlot = 1; updateUI(); }
        if (e.key === '2') { selectedSlot = 2; updateUI(); }
        if (e.key === '3') { selectedSlot = 3; updateUI(); }
        if(e.code==='KeyW') moveForward=true; if(e.code==='KeyS') moveBackward=true;
        if(e.code==='KeyA') moveLeft=true; if(e.code==='KeyD') moveRight=true;
        if(e.code==='Space' && canJump) { velocity.y = JUMP_FORCE; canJump = false; }
    });
    window.addEventListener('keyup', (e) => {
        if(e.code==='KeyW') moveForward=false; if(e.code==='KeyS') moveBackward=false;
        if(e.code==='KeyA') moveLeft=false; if(e.code==='KeyD') moveRight=false;
    });

    animate();
}

function checkMillInteraction() {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length > 0 && intersects[0].distance < REACH_DISTANCE) {
        const obj = intersects[0].object;
        if (obj.userData.isHopper && logs > 0) { logs--; socket.emit('drop-log'); updateUI(); }
        if (obj.userData.isPallet && lumberReadyCount > 0) { lumberReadyCount--; socket.emit('sell-lumber'); updateUI(); }
    }
}

socket.on('animate-log-belt', () => {
    const logMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5), new THREE.MeshLambertMaterial({color: 0x8B4513}));
    logMesh.rotation.z = Math.PI/2;
    logMesh.position.set(6, 0.8, 0);
    scene.add(logMesh);
    activeLogsOnBelt.push(logMesh);
});

function animate() {
    requestAnimationFrame(animate);
    let delta = 0.016;

    // Belt Animation
    activeLogsOnBelt.forEach((log, index) => {
        log.position.x -= 0.05; // Move toward mill
        if (log.position.x < 2) { scene.remove(log); activeLogsOnBelt.splice(index, 1); }
    });

    // Tree Growth
    Object.values(treeMeshes).forEach(mesh => {
        if (mesh.userData && !mesh.userData.isGrown) {
            const progress = Math.min((Date.now() - mesh.userData.createdAt) / 60000, 1);
            const s = 0.1 + (0.9 * progress);
            mesh.scale.set(s, s, s);
            if (progress >= 1) mesh.userData.isGrown = true;
        }
    });

    if (controls.isLocked) {
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= GRAVITY * delta;
        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();
        if (moveForward || moveBackward) velocity.z -= direction.z * 400.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 400.0 * delta;
        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        camera.position.y += (velocity.y * delta);
        if (camera.position.y < 1.6) { velocity.y = 0; camera.position.y = 1.6; canJump = true; }
    }
    renderer.render(scene, camera);
}

// ... (Keep existing socket listeners for time-sync, tree-added, gain-log, payment, etc.) ...
// These are exactly as they were in the previous step.
