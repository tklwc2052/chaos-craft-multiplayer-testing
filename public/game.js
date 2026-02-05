const socket = io();
let scene, camera, renderer, controls, raycaster;
let forklift, forkliftForks, isDrivingForklift = false, forkHeight = 0.5;
let forkliftVel = 0, forkliftSteer = 0, keys = {};
let treeMeshes = {}, otherPlayers = {}, lumberStackMeshes = [];
let coins = 100, saplings = 0, logs = 0, selectedSlot = 1;
let velocity = new THREE.Vector3(), direction = new THREE.Vector3();
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let canJump = false;

const GRAVITY = 30.0;
const REACH_DISTANCE = 5.0;

document.getElementById('startBtn').addEventListener('click', () => {
    document.getElementById('login').style.display = 'none';
    document.getElementById('ui').style.display = 'block';
    init3D();
    socket.emit('join', { username: document.getElementById('usernameInput').value || "Lumberjack" });
});

function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000005);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    
    controls = new THREE.PointerLockControls(camera, document.body);
    raycaster = new THREE.Raycaster();

    // Lighting
    scene.add(new THREE.HemisphereLight(0xddeeff, 0x2d4c1e, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6);
    sun.position.set(10, 20, 10);
    scene.add(sun);

    // Ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshPhongMaterial({color: 0x2d4c1e}));
    ground.rotation.x = -Math.PI/2;
    scene.add(ground);

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for(let i=0; i<1000; i++) starPos.push((Math.random()-0.5)*500, Math.random()*200, (Math.random()-0.5)*500);
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({color: 0xffffff, size: 0.5})));

    // Mill & Depot
    const mill = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 8), new THREE.MeshPhongMaterial({color: 0x8B4513}));
    mill.position.set(15, 2.5, 15);
    scene.add(mill);

    const depot = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 10), new THREE.MeshStandardMaterial({color: 0x444444}));
    depot.position.set(-20, 0.1, 0);
    scene.add(depot);

    initForklift();
    animate();
}

function initForklift() {
    forklift = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 3), new THREE.MeshStandardMaterial({color: 0xffd700}));
    body.position.y = 0.8; forklift.add(body);
    forkliftForks = new THREE.Group();
    const pL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 2), new THREE.MeshStandardMaterial({color: 0x555555}));
    pL.position.set(-0.5, 0, 1); forkliftForks.add(pL);
    forkliftForks.position.y = 0.5; forklift.add(forkliftForks);
    scene.add(forklift);
}

// Fixed Key Listeners
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyW') moveForward = true;
    if (e.code === 'KeyS') moveBackward = true;
    if (e.code === 'KeyA') moveLeft = true;
    if (e.code === 'KeyD') moveRight = true;
    if (e.code === 'KeyE') toggleForklift();
    if (e.code === 'Space' && canJump && !isDrivingForklift) { velocity.y = 10; canJump = false; }
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'KeyW') moveForward = false;
    if (e.code === 'KeyS') moveBackward = false;
    if (e.code === 'KeyA') moveLeft = false;
    if (e.code === 'KeyD') moveRight = false;
});

function toggleForklift() {
    const dist = camera.position.distanceTo(forklift.position);
    if (isDrivingForklift) {
        isDrivingForklift = false;
        camera.position.x += 3;
        controls.lock();
    } else if (dist < 5) {
        isDrivingForklift = true;
        controls.unlock();
    }
}

function animate() {
    requestAnimationFrame(animate);
    const delta = 0.016;

    if (isDrivingForklift) {
        if (keys['KeyW']) forkliftVel += 0.02;
        if (keys['KeyS']) forkliftVel -= 0.02;
        forkliftVel *= 0.95;
        if (keys['KeyA']) forkliftSteer = THREE.MathUtils.lerp(forkliftSteer, 0.05, 0.1);
        else if (keys['KeyD']) forkliftSteer = THREE.MathUtils.lerp(forkliftSteer, -0.05, 0.1);
        else forkliftSteer = 0;

        forklift.rotation.y += forkliftVel * forkliftSteer * 20;
        forklift.translateZ(forkliftVel);
        
        camera.position.set(forklift.position.x - Math.sin(forklift.rotation.y)*10, 6, forklift.position.z - Math.cos(forklift.rotation.y)*10);
        camera.lookAt(forklift.position);
        socket.emit('update-forklift', { x: forklift.position.x, y: forklift.position.y, z: forklift.position.z, ry: forklift.rotation.y, forkY: forkHeight });
    } else if (controls.isLocked) {
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
        if (camera.position.y < 1.8) {
            velocity.y = 0; camera.position.y = 1.8; canJump = true;
        }
        socket.emit('move', { x: camera.position.x, y: camera.position.y, z: camera.position.z, ry: camera.rotation.y });
    }
    renderer.render(scene, camera);
}

// Socket Receivers
socket.on('init-trees', (data) => {
    data.forEach(t => {
        const geo = new THREE.BoxGeometry(0.8, t.height, 0.8);
        const mat = new THREE.MeshLambertMaterial({color: 0x8B4513});
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(t.x, t.height/2, t.z);
        scene.add(mesh);
        treeMeshes[t.id] = mesh;
    });
});

socket.on('forklift-moved', (data) => {
    if (!isDrivingForklift) {
        forklift.position.set(data.x, data.y, data.z);
        forklift.rotation.y = data.ry;
    }
});
