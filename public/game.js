const socket = io();
let scene, camera, renderer, controls, raycaster;
let forklift, forkliftForks, isDrivingForklift = false, forkHeight = 0.5;
let forkliftVel = 0, forkliftSteer = 0, keys = {};
let treeMeshes = {}, otherPlayers = {}, lumberStackMeshes = [];
let coins = 100, saplings = 0, logs = 0, selectedSlot = 1, lumberReadyCount = 0;

document.getElementById('startBtn').addEventListener('click', () => {
    document.getElementById('login').style.display = 'none';
    document.getElementById('ui').style.display = 'block';
    init3D();
    socket.emit('join', { username: document.getElementById('usernameInput').value });
});

function init3D() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    controls = new THREE.PointerLockControls(camera, document.body);
    raycaster = new THREE.Raycaster();

    // Environment
    scene.add(new THREE.HemisphereLight(0xddeeff, 0x2d4c1e, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(10, 20, 10);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshPhongMaterial({color: 0x2d4c1e}));
    ground.rotation.x = -Math.PI/2;
    scene.add(ground);

    // Depot Dock
    const depot = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 10), new THREE.MeshStandardMaterial({color: 0x444444}));
    depot.position.set(-20, 0.25, 0);
    scene.add(depot);

    initForklift();
    animate();
}

function initForklift() {
    forklift = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 3.5), new THREE.MeshStandardMaterial({color: 0xffd700}));
    body.position.y = 0.8; forklift.add(body);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 1.5), new THREE.MeshStandardMaterial({color: 0x333333}));
    mast.position.set(0, 1.5, 1.7); forklift.add(mast);
    forkliftForks = new THREE.Group();
    const pL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 2), new THREE.MeshStandardMaterial({color: 0x555555}));
    const pR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 2), new THREE.MeshStandardMaterial({color: 0x555555}));
    pL.position.set(-0.5, 0, 1); pR.position.set(0.5, 0, 1);
    forkliftForks.add(pL, pR); forkliftForks.position.set(0, 0.5, 1.7);
    forklift.add(forkliftForks); scene.add(forklift);
}

// Controls
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyE') toggleForklift();
    if (e.key === '1') selectedSlot = 1;
    if (e.key === '2') selectedSlot = 2;
    if (e.key === '3') selectedSlot = 3;
    updateUI();
});
window.addEventListener('keyup', (e) => keys[e.code] = false);

function toggleForklift() {
    if (camera.position.distanceTo(forklift.position) < 5 || isDrivingForklift) {
        isDrivingForklift = !isDrivingForklift;
        if (isDrivingForklift) controls.unlock();
        else controls.lock();
    }
}

function animate() {
    requestAnimationFrame(animate);
    const delta = 0.016;

    if (isDrivingForklift) {
        // Rear-wheel steering physics
        if (keys['KeyW']) forkliftVel += 0.02;
        if (keys['KeyS']) forkliftVel -= 0.02;
        forkliftVel *= 0.95;
        if (keys['KeyA']) forkliftSteer = THREE.MathUtils.lerp(forkliftSteer, 0.6, 0.1);
        else if (keys['KeyD']) forkliftSteer = THREE.MathUtils.lerp(forkliftSteer, -0.6, 0.1);
        else forkliftSteer = THREE.MathUtils.lerp(forkliftSteer, 0, 0.1);
        
        forklift.rotation.y += forkliftVel * forkliftSteer;
        forklift.translateZ(forkliftVel);

        if (keys['KeyR']) forkHeight = Math.min(forkHeight + 0.05, 2.5);
        if (keys['KeyF']) forkHeight = Math.max(forkHeight - 0.05, 0.1);
        forkliftForks.position.y = forkHeight;

        camera.position.set(forklift.position.x - Math.sin(forklift.rotation.y)*8, 5, forklift.position.z - Math.cos(forklift.rotation.y)*8);
        camera.lookAt(forklift.position);
        
        checkForkliftPickup();
        checkDepotDelivery();
        socket.emit('update-forklift', { x: forklift.position.x, y: forklift.position.y, z: forklift.position.z, ry: forklift.rotation.y, forkY: forkHeight });
    }

    // Tree growth & other players logic (omitted for brevity, keep from previous versions)
    renderer.render(scene, camera);
}

function checkForkliftPickup() {
    lumberStackMeshes.forEach(p => {
        if (!p.userData.isCarried && p.position.distanceTo(forklift.position) < 3 && forkHeight < 0.5) {
            p.userData.isCarried = true;
            forkliftForks.add(p);
            p.position.set(0, 0.1, 1);
        }
    });
}

function checkDepotDelivery() {
    if (forklift.position.distanceTo(new THREE.Vector3(-20,0,0)) < 5 && forkHeight < 0.3) {
        forkliftForks.children.forEach(c => {
            if(c.userData.isCarried) {
                socket.emit('sell-lumber');
                forkliftForks.remove(c);
            }
        });
    }
}
// (Include addTreeToScene, updateUI, and Socket Listeners from previous version)
