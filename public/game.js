const socket = io();
let scene, camera, renderer, controls, raycaster;
let forklift, forkliftForks, isDrivingForklift = false, forkHeight = 0.5;
let forkliftVel = 0, forkliftSteer = 0, keys = {};
let treeMeshes = {}, otherPlayers = {}, lumberStackMeshes = [];
let coins = 100, saplings = 0, logs = 0, selectedSlot = 1;
let velocity = new THREE.Vector3(), direction = new THREE.Vector3();
let canJump = false;

const GRAVITY = 30.0; // Stronger gravity for snappy landing

document.getElementById('startBtn').addEventListener('click', () => {
    document.getElementById('login').style.display = 'none';
    document.getElementById('ui').style.display = 'block';
    init3D();
    socket.emit('join', { username: document.getElementById('usernameInput').value });
});

function init3D() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 0); // Start high
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    
    controls = new THREE.PointerLockControls(camera, document.body);
    raycaster = new THREE.Raycaster();

    scene.add(new THREE.HemisphereLight(0xddeeff, 0x2d4c1e, 0.5));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshPhongMaterial({color: 0x2d4c1e}));
    ground.rotation.x = -Math.PI/2;
    scene.add(ground);

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
    forkliftForks.add(pL, pR); forklift.add(forkliftForks);
    scene.add(forklift);
}

window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyE') toggleForklift();
    if (e.code === 'KeyW' || e.code === 'KeyS' || e.code === 'KeyA' || e.code === 'KeyD') {
        if (!isDrivingForklift) {
            if (e.code === 'KeyW') moveForward = true;
            if (e.code === 'KeyS') moveBackward = true;
            if (e.code === 'KeyA') moveLeft = true;
            if (e.code === 'KeyD') moveRight = true;
        }
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'KeyW') moveForward = false;
    if (e.code === 'KeyS') moveBackward = false;
    if (e.code === 'KeyA') moveLeft = false;
    if (e.code === 'KeyD') moveRight = false;
});

let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;

function toggleForklift() {
    if (isDrivingForklift) {
        isDrivingForklift = false;
        // Move player away from forklift body on exit
        camera.position.x += 3; 
        camera.position.y = 1.8;
        controls.lock();
    } else {
        if (camera.position.distanceTo(forklift.position) < 5) {
            isDrivingForklift = true;
            controls.unlock();
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    const delta = 0.016;

    if (isDrivingForklift) {
        // FORKLIFT CONTROLS
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

        camera.position.set(forklift.position.x - Math.sin(forklift.rotation.y)*10, 6, forklift.position.z - Math.cos(forklift.rotation.y)*10);
        camera.lookAt(forklift.position);
        
        socket.emit('update-forklift', { x: forklift.position.x, y: forklift.position.y, z: forklift.position.z, ry: forklift.rotation.y, forkY: forkHeight });
    } else if (controls.isLocked) {
        // FPS CONTROLS
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
            velocity.y = 0;
            camera.position.y = 1.8;
            canJump = true;
        }
        
        socket.emit('move', { x: camera.position.x, y: camera.position.y, z: camera.position.z, ry: camera.rotation.y });
    }
    renderer.render(scene, camera);
}
