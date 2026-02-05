const socket = io();
let scene, camera, renderer, controls, raycaster;
let sun, ambientLight, stars;

// Movement variables
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let velocity = new THREE.Vector3(), direction = new THREE.Vector3();
let canJump = false;

// Game State
let coins = 100, saplings = 0, logs = 0, lumberReadyCount = 0;
let selectedSlot = 1; // 1: Axe, 2: Seed, 3: Logs
let treeData = [], treeMeshes = {}, otherPlayers = {};
let activeLogsOnBelt = [];

const REACH_DISTANCE = 5.0;
const GRAVITY = 24.0;
const JUMP_FORCE = 10.0;

// Make buy function global for HTML access
window.buySapling = function() {
    if (coins >= 20) {
        coins -= 20;
        saplings++;
        updateUI();
    }
};

document.getElementById('startBtn').addEventListener('click', () => {
    document.getElementById('login').style.display = 'none';
    document.getElementById('ui').style.display = 'block';
    document.getElementById('crosshair').style.display = 'block';
    init3D();
    socket.emit('join', { username: document.getElementById('usernameInput').value || "Player" });
});

function init3D() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.rotation.order = 'YXZ';

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    controls = new THREE.PointerLockControls(camera, document.body);
    raycaster = new THREE.Raycaster();

    // --- LIGHTING ---
    ambientLight = new THREE.HemisphereLight(0xddeeff, 0x2d4c1e, 0.5);
    scene.add(ambientLight);
    sun = new THREE.DirectionalLight(0xffffff, 0.8);
    scene.add(sun);

    // --- ENVIRONMENT ---
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshPhongMaterial({ color: 0x2d4c1e })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < 2000; i++) starPos.push((Math.random() - 0.5) * 1000, Math.random() * 500, (Math.random() - 0.5) * 1000);
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff }));
    scene.add(stars);

    // --- LUMBER MILL ---
    const mill = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 8), new THREE.MeshPhongMaterial({ color: 0x882222 }));
    body.position.y = 2.5;
    mill.add(body);

    const hopper = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.5, 2.5), new THREE.MeshPhongMaterial({ color: 0x333333 }));
    hopper.position.set(6, 0.25, 0);
    hopper.userData.isHopper = true;
    mill.add(hopper);

    const pallet = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 3), new THREE.MeshPhongMaterial({ color: 0xdeb887 }));
    pallet.position.set(-6, 0.1, 0);
    pallet.userData.isPallet = true;
    mill.add(pallet);

    const belt = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.2, 1.2), new THREE.MeshPhongMaterial({ color: 0x111111 }));
    belt.position.set(4.2, 0.5, 0);
    mill.add(belt);

    scene.add(mill);

    // --- CONTROLS ---
    window.addEventListener('keydown', (e) => {
        if (e.key === '1') { selectedSlot = 1; updateUI(); }
        if (e.key === '2') { selectedSlot = 2; updateUI(); }
        if (e.key === '3') { selectedSlot = 3; updateUI(); }
        if (e.code === 'KeyW') moveForward = true;
        if (e.code === 'KeyS') moveBackward = true;
        if (e.code === 'KeyA') moveLeft = true;
        if (e.code === 'KeyD') moveRight = true;
        if (e.code === 'Space' && canJump) { velocity.y = JUMP_FORCE; canJump = false; }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'KeyW') moveForward = false;
        if (e.code === 'KeyS') moveBackward = false;
        if (e.code === 'KeyA') moveLeft = false;
        if (e.code === 'KeyD') moveRight = false;
    });

    document.addEventListener('mousedown', (e) => {
        if (!controls.isLocked) { controls.lock(); return; }
        if (e.button === 0) { // Left Click
            if (selectedSlot === 1) checkTreeClick();
            if (selectedSlot === 3) checkMillInteraction();
        }
        if (e.button === 2 && selectedSlot === 2) placeSapling();
    });

    animate();
}

// --- GAME LOGIC FUNCTIONS ---

function updateUI() {
    document.getElementById('coinDisplay').innerText = coins;
    document.getElementById('saplingDisplay').innerText = saplings;
    document.getElementById('logDisplay').innerText = logs;
    document.getElementById('lumberReadyDisplay').innerText = lumberReadyCount;

    document.getElementById('slot1').classList.toggle('active', selectedSlot === 1);
    document.getElementById('slot2').classList.toggle('active', selectedSlot === 2);
    document.getElementById('slot3').classList.toggle('active', selectedSlot === 3);
}

function addTreeToScene(t) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.8, t.height, 0.8), new THREE.MeshLambertMaterial({ color: 0x8B4513 }));
    trunk.position.y = t.height / 2;
    const leaves = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshLambertMaterial({ color: 0x228B22 }));
    leaves.position.y = t.height + 1;
    group.add(trunk, leaves);
    group.position.set(t.x, 0, t.z);
    group.userData = { treeId: t.id, createdAt: t.createdAt, isGrown: t.isGrown };
    
    if (!t.isGrown) group.scale.set(0.1, 0.1, 0.1);
    
    scene.add(group);
    treeMeshes[t.id] = group;
}

function checkTreeClick() {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(Object.values(treeMeshes), true);
    if (intersects.length > 0 && intersects[0].distance < REACH_DISTANCE) {
        let obj = intersects[0].object;
        while (obj.parent && obj.userData.treeId === undefined) obj = obj.parent;
        if (obj.userData.treeId !== undefined && obj.userData.isGrown) {
            socket.emit('click-tree', obj.userData.treeId);
        }
    }
}

function placeSapling() {
    if (saplings <= 0) return;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(scene.children);
    const ground = intersects.find(i => i.object.geometry.type === "PlaneGeometry");
    if (ground && ground.distance < REACH_DISTANCE) {
        socket.emit('place-tree', { x: ground.point.x, z: ground.point.z });
        saplings--;
        updateUI();
    }
}

function checkMillInteraction() {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length > 0 && intersects[0].distance < REACH_DISTANCE) {
        const obj = intersects[0].object;
        if (obj.userData.isHopper && logs > 0) { 
            logs--; 
            socket.emit('drop-log'); 
            updateUI(); 
        }
        if (obj.userData.isPallet && lumberReadyCount > 0) { 
            lumberReadyCount--; 
            socket.emit('sell-lumber'); 
            updateUI(); 
        }
    }
}

function createOtherPlayerMesh(id, info) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(1, 2, 1),
        new THREE.MeshStandardMaterial({ color: parseInt(info.color, 16) })
    );
    group.add(body);
    group.position.set(info.x, info.y - 0.8, info.z);
    scene.add(group);
    otherPlayers[id] = group;
}

// --- SOCKET EVENTS ---

socket.on('init-trees', (data) => {
    treeData = data;
    data.forEach(t => addTreeToScene(t));
});

socket.on('current-players', (serverPlayers) => {
    Object.keys(serverPlayers).forEach(id => {
        if (id !== socket.id) createOtherPlayerMesh(id, serverPlayers[id]);
    });
});

socket.on('new-player', (data) => {
    if (!otherPlayers[data.id]) createOtherPlayerMesh(data.id, data.info);
});

socket.on('player-moved', (data) => {
    if (otherPlayers[data.id]) {
        otherPlayers[data.id].position.set(data.pos.x, data.pos.y - 0.8, data.pos.z);
        otherPlayers[data.id].rotation.y = data.pos.ry;
    }
});

socket.on('player-left', (id) => {
    if (otherPlayers[id]) {
        scene.remove(otherPlayers[id]);
        delete otherPlayers[id];
    }
});

socket.on('animate-log-belt', () => {
    const logMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5), new THREE.MeshLambertMaterial({ color: 0x8B4513 }));
    logMesh.rotation.z = Math.PI / 2;
    logMesh.position.set(6, 0.8, 0);
    scene.add(logMesh);
    activeLogsOnBelt.push(logMesh);
});

socket.on('tree-removed', (id) => { if (treeMeshes[id]) { scene.remove(treeMeshes[id]); delete treeMeshes[id]; } });
socket.on('gain-log', () => { logs++; updateUI(); });
socket.on('lumber-ready', () => { lumberReadyCount++; updateUI(); });
socket.on('payment', (val) => { coins += val; updateUI(); });
socket.on('tree-added', (t) => { addTreeToScene(t); });

socket.on('time-sync', (serverSeconds) => {
    const cyclePercent = serverSeconds / 1200;
    const angle = (cyclePercent * Math.PI * 2) + Math.PI;
    sun.position.set(Math.cos(angle) * 200, Math.sin(angle) * 200, 0);

    if (sun.position.y > 0) {
        const intensity = Math.min(sun.position.y / 50, 1);
        scene.background = new THREE.Color().setHSL(0.6, 0.5, 0.5 * intensity + 0.1);
        sun.intensity = intensity;
        ambientLight.intensity = intensity * 0.5 + 0.2;
        stars.visible = false;
    } else {
        scene.background = new THREE.Color(0x050510);
        sun.intensity = 0;
        ambientLight.intensity = 0.1;
        stars.visible = true;
    }
});

// --- ANIMATION LOOP ---

function animate() {
    requestAnimationFrame(animate);
    let delta = 0.016;

    activeLogsOnBelt.forEach((log, index) => {
        log.position.x -= 0.05;
        if (log.position.x < 2) { scene.remove(log); activeLogsOnBelt.splice(index, 1); }
    });

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
        if (camera.position.y < 1.6) {
            velocity.y = 0;
            camera.position.y = 1.6;
            canJump = true;
        }

        // Periodic Sync
        if (Date.now() % 30 < 20) {
            socket.emit('move', { x: camera.position.x, y: camera.position.y, z: camera.position.z, ry: camera.rotation.y });
        }
    }
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
