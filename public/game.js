const socket = io();
let scene, camera, renderer, controls, raycaster;
let forklift, forkliftForks, isDriving = false;
let treeMeshes = {}, otherPlayers = {};
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let velocity = new THREE.Vector3(), keys = {};

// Start Sequence
document.getElementById('startBtn').addEventListener('click', () => {
    document.getElementById('login').style.display = 'none';
    document.getElementById('ui').style.display = 'block';
    init();
});

function init() {
    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    controls = new THREE.PointerLockControls(camera, document.body);
    raycaster = new THREE.Raycaster();

    // 2. Lighting & Ground
    scene.add(new THREE.HemisphereLight(0xaaaaaa, 0x444444, 0.7));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshPhongMaterial({ color: 0x228b22 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // 3. Objects
    createStars();
    createMill();
    createForklift();

    // 4. Input Listeners
    setupInputs();

    // 5. Connect to Server
    socket.emit('join', { username: document.getElementById('usernameInput').value });
    
    animate();
}

function createStars() {
    const geo = new THREE.BufferGeometry();
    const pos = [];
    for(let i=0; i<1000; i++) pos.push((Math.random()-0.5)*400, Math.random()*200, (Math.random()-0.5)*400);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 })));
}

function createMill() {
    const mill = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshPhongMaterial({ color: 0x552211 }));
    mill.position.set(20, 3, 20);
    scene.add(mill);
}

function createForklift() {
    forklift = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.5, 3), new THREE.MeshStandardMaterial({ color: 0xffcc00 }));
    body.position.y = 1;
    forklift.add(body);
    
    forkliftForks = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 2), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    forkliftForks.position.set(0, 0.5, 2);
    forklift.add(forkliftForks);
    
    scene.add(forklift);
}

function setupInputs() {
    window.addEventListener('keydown', (e) => {
        keys[e.code] = true;
        if(e.code === 'KeyW') moveForward = true;
        if(e.code === 'KeyS') moveBackward = true;
        if(e.code === 'KeyA') moveLeft = true;
        if(e.code === 'KeyD') moveRight = true;
        if(e.code === 'KeyE') toggleVehicle();
    });
    window.addEventListener('keyup', (e) => {
        keys[e.code] = false;
        if(e.code === 'KeyW') moveForward = false;
        if(e.code === 'KeyS') moveBackward = false;
        if(e.code === 'KeyA') moveLeft = false;
        if(e.code === 'KeyD') moveRight = false;
    });
    document.addEventListener('mousedown', () => { if(!isDriving) controls.lock(); });
}

function toggleVehicle() {
    const dist = camera.position.distanceTo(forklift.position);
    if (isDriving) {
        isDriving = false;
        camera.position.x += 4;
        controls.lock();
    } else if (dist < 6) {
        isDriving = true;
        controls.unlock();
    }
}

function animate() {
    requestAnimationFrame(animate);
    const delta = 0.016;

    if (isDriving) {
        // Vehicle logic
        let v = 0;
        if(keys['KeyW']) v = 0.2;
        if(keys['KeyS']) v = -0.1;
        if(keys['KeyA']) forklift.rotation.y += 0.04;
        if(keys['KeyD']) forklift.rotation.y -= 0.04;
        forklift.translateZ(v);
        
        camera.position.set(forklift.position.x, forklift.position.y + 6, forklift.position.z - 10);
        camera.lookAt(forklift.position);
        socket.emit('update-forklift', { x: forklift.position.x, y: forklift.position.y, z: forklift.position.z, ry: forklift.rotation.y });
    } else if (controls.isLocked) {
        // Player logic
        velocity.x -= velocity.x * 10 * delta;
        velocity.z -= velocity.z * 10 * delta;
        
        if (moveForward) velocity.z -= 400 * delta;
        if (moveBackward) velocity.z += 400 * delta;
        if (moveLeft) velocity.x -= 400 * delta;
        if (moveRight) velocity.x += 400 * delta;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        
        socket.emit('move', { x: camera.position.x, y: camera.position.y, z: camera.position.z, ry: camera.rotation.y });
    }
    renderer.render(scene, camera);
}

// Socket Listeners
socket.on('init-world', (data) => {
    data.trees.forEach(t => {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, t.height), new THREE.MeshLambertMaterial({ color: 0x552200 }));
        trunk.position.y = t.height / 2;
        tree.add(trunk);
        tree.position.set(t.x, 0, t.z);
        scene.add(tree);
    });
});
