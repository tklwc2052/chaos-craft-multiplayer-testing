const socket = io();
let scene, camera, renderer, controls, raycaster;
let sun, ambientLight, stars;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let velocity = new THREE.Vector3(), direction = new THREE.Vector3();
let otherPlayers = {}, treeMeshes = {}, treeData = [], coins = 100;

let logs = 0, saplings = 0, lumberReadyCount = 0, selectedSlot = 1;
const REACH_DISTANCE = 5.0, GRAVITY = 24.0, JUMP_FORCE = 10.0;
let canJump = false;
let activeLogsOnBelt = [];

// Fix: Make functions global for HTML buttons
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
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    camera.rotation.order = 'YXZ';
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    controls = new THREE.PointerLockControls(camera, document.body);

    raycaster = new THREE.Raycaster();
    
    // Dimmer Lighting
    ambientLight = new THREE.HemisphereLight(0xddeeff, 0x2d4c1e, 0.5);
    scene.add(ambientLight);
    sun = new THREE.DirectionalLight(0xffffff, 0.8);
    scene.add(sun);

    // Darker Grass
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200), 
        new THREE.MeshPhongMaterial({color: 0x2d4c1e}) // Fixed: Darker Green
    );
    ground.rotation.x = -Math.PI/2;
    scene.add(ground);

    // Lumber Mill
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
    scene.add(mill);

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for(let i=0; i<2000; i++) starPos.push((Math.random()-0.5)*1000, Math.random()*500, (Math.random()-0.5)*1000);
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    stars = new THREE.Points(starGeo, new THREE.PointsMaterial({color: 0xffffff}));
    scene.add(stars);

    // Fix: Inventory Keys
    window.addEventListener('keydown', (e) => {
        if (e.key === '1') { selectedSlot = 1; updateUI(); }
        if (e.key === '2') { selectedSlot = 2; updateUI(); }
        if (e.key === '3') { selectedSlot = 3; updateUI(); }
        
        if(e.code==='KeyW') moveForward=true; 
        if(e.code==='KeyS') moveBackward=true;
        if(e.code==='KeyA') moveLeft=true; 
        if(e.code==='KeyD') moveRight=true;
        if(e.code==='Space' && canJump) { velocity.y = JUMP_FORCE; canJump = false; }
    });
    
    window.addEventListener('keyup', (e) => {
        if(e.code==='KeyW') moveForward=false; 
        if(e.code==='KeyS') moveBackward=false;
        if(e.code==='KeyA') moveLeft=false; 
        if(e.code==='KeyD') moveRight=false;
    });

    document.addEventListener('mousedown', (e) => {
        if (!controls.isLocked) { controls.lock(); return; }
        if (e.button === 0) {
            if (selectedSlot === 1) checkTreeClick();
            if (selectedSlot === 3) checkMillInteraction();
        }
        if (e.button === 2 && selectedSlot === 2) placeSapling();
    });

    animate();
}

function updateUI() {
    document.getElementById('coinDisplay').innerText = coins;
    document.getElementById('saplingDisplay').innerText = saplings;
    document.getElementById('logDisplay').innerText = logs;
    document.getElementById('lumberReadyDisplay').innerText = lumberReadyCount;
    
    // Fix: Visual Slot Switching
    document.getElementById('slot1').classList.toggle('active', selectedSlot === 1);
    document.getElementById('slot2').classList.toggle('active', selectedSlot === 2);
    document.getElementById('slot3').classList.toggle('active', selectedSlot === 3);
}

// Socket Receivers
socket.on('init-trees', (data) => {
    console.log("Trees received:", data.length);
    treeData = data;
    data.forEach(t => addTreeToScene(t));
});

function addTreeToScene(t) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.8, t.height, 0.8), new THREE.MeshLambertMaterial({color: 0x8B4513}));
    trunk.position.y = t.height / 2;
    const leaves = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshLambertMaterial({color: 0x228B22}));
    leaves.position.y = t.height + 1;
    group.add(trunk, leaves);
    group.position.set(t.x, 0, t.z);
    group.userData = { treeId: t.id, createdAt: t.createdAt, isGrown: t.isGrown };
    if(!t.isGrown) group.scale.set(0.1, 0.1, 0.1);
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
        if (obj.userData.isHopper && logs > 0) { logs--; socket.emit('drop-log'); updateUI(); }
        if (obj.userData.isPallet && lumberReadyCount > 0) { lumberReadyCount--; socket.emit('sell-lumber'); updateUI(); }
    }
}

socket.on('tree-removed', (id) => { if(treeMeshes[id]) { scene.remove(treeMeshes[id]); delete treeMeshes[id]; } });
socket.on('gain-log', () => { logs++; updateUI(); });
socket.on('lumber-ready', () => { lumberReadyCount++; updateUI(); });
socket.on('payment', (val) => { coins += val; updateUI(); });
socket.on('tree-added', (t) => { addTreeToScene(t); treeData.push(t); });

function animate() {
    requestAnimationFrame(animate);
    let delta = 0.016;
    
    // Growth
    Object.values(treeMeshes).forEach(mesh => {
        if (mesh.userData && !mesh.userData.isGrown) {
            const age = Date.now() - mesh.userData.createdAt;
            const progress = Math.min(age / 60000, 1);
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
