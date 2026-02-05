const socket = io();
let scene, camera, renderer, controls, raycaster;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, isShifting = false;
let velocity = new THREE.Vector3(), direction = new THREE.Vector3();
let otherPlayers = {}, treeMeshes = {}, coins = 0;

const GRAVITY = 24.0; 
const JUMP_FORCE = 10.0; 
let canJump = false;
let lastSentPos = { x: 0, y: 0, z: 0, ry: 0 };

document.getElementById('startBtn').addEventListener('click', () => {
    const name = document.getElementById('usernameInput').value || "Player";
    document.getElementById('userNameDisplay').innerText = name;
    document.getElementById('login').style.display = 'none';
    document.getElementById('ui').style.display = 'block';
    document.getElementById('crosshair').style.display = 'block';
    init3D();
    socket.emit('join', { username: name });
});

function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); 
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    controls = new THREE.PointerLockControls(camera, document.body);
    camera.position.set(0, 1.6, 0);
    
    document.addEventListener('click', () => {
        controls.isLocked ? checkTreeClick() : controls.lock();
    });

    raycaster = new THREE.Raycaster();
    scene.add(new THREE.HemisphereLight(0xeeeeff, 0x777788, 1));
    
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshPhongMaterial({color: 0x567d46}));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    window.addEventListener('keydown', (e) => {
        if(e.code==='KeyW') moveForward=true; 
        if(e.code==='KeyS') moveBackward=true;
        if(e.code==='KeyA') moveLeft=true; 
        if(e.code==='KeyD') moveRight=true;
        if(e.shiftKey) isShifting = true;
        if(e.code==='Space' && canJump) { velocity.y = JUMP_FORCE; canJump = false; }
    });
    window.addEventListener('keyup', (e) => {
        if(e.code==='KeyW') moveForward=false; 
        if(e.code==='KeyS') moveBackward=false;
        if(e.code==='KeyA') moveLeft=false; 
        if(e.code==='KeyD') moveRight=false;
        if(!e.shiftKey) isShifting = false;
    });

    animate();
}

function createPlayerMesh(color) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ color: parseInt(color, 16) }));
    group.add(body);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 }); 
    const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.05), eyeMat);
    leftEye.position.set(-0.25, 0.6, -0.51); 
    const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.05), eyeMat);
    rightEye.position.set(0.25, 0.6, -0.51); 
    group.add(leftEye, rightEye);
    return group;
}

// HEARTBEAT LOOP FIX: Rotation check
setInterval(() => {
    if (controls && controls.isLocked) {
        // We use camera.rotation.y, but ensure it's checked against the last sent value accurately
        let currentRY = camera.rotation.y;

        if (camera.position.x !== lastSentPos.x || camera.position.y !== lastSentPos.y || camera.position.z !== lastSentPos.z || currentRY !== lastSentPos.ry) {
            socket.emit('move', { 
                x: camera.position.x, 
                y: camera.position.y, 
                z: camera.position.z, 
                ry: currentRY 
            });
            lastSentPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z, ry: currentRY };
        }
    }
}, 50);

socket.on('init-trees', (serverTrees) => {
    serverTrees.forEach(t => {
        const group = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.8), new THREE.MeshLambertMaterial({color: 0x8B4513}));
        trunk.position.y = 1;
        const leaves = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshLambertMaterial({color: 0x228B22}));
        leaves.position.y = 3;
        group.add(trunk, leaves);
        group.position.set(t.x, 0, t.z);
        group.userData.treeId = t.id;
        scene.add(group);
        treeMeshes[t.id] = group;
    });
});

socket.on('update-players', (serverPlayers) => {
    Object.keys(serverPlayers).forEach(id => {
        if (id !== socket.id && !otherPlayers[id]) {
            const mesh = createPlayerMesh(serverPlayers[id].color);
            scene.add(mesh);
            otherPlayers[id] = mesh;
        }
        if(otherPlayers[id]) {
            otherPlayers[id].position.set(serverPlayers[id].x, serverPlayers[id].y - 0.8, serverPlayers[id].z);
            otherPlayers[id].rotation.y = serverPlayers[id].ry;
        }
    });
});

socket.on('player-moved', (data) => { 
    if (otherPlayers[data.id]) {
        otherPlayers[data.id].position.set(data.pos.x, data.pos.y - 0.8, data.pos.z);
        // Direct rotation sync
        otherPlayers[data.id].rotation.y = data.pos.ry;
    }
});

socket.on('player-left', (id) => { 
    if (otherPlayers[id]) { scene.remove(otherPlayers[id]); delete otherPlayers[id]; } 
});

function checkTreeClick() {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(Object.values(treeMeshes), true);
    if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj.parent && obj.userData.treeId === undefined) { obj = obj.parent; }
        if (obj.userData.treeId !== undefined) {
            socket.emit('click-tree', obj.userData.treeId);
            coins += 100;
            document.getElementById('coinDisplay').innerText = coins;
        }
    }
}

socket.on('tree-removed', (id) => { if (treeMeshes[id]) { scene.remove(treeMeshes[id]); delete treeMeshes[id]; } });

function animate() {
    requestAnimationFrame(animate);
    if (controls.isLocked) {
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
    }
    renderer.render(scene, camera);
}
