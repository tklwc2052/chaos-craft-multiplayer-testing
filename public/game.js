const socket = io();
let scene, camera, renderer, controls, raycaster;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, isShifting = false;
let velocity = new THREE.Vector3(), direction = new THREE.Vector3();
let otherPlayers = {}, treeMeshes = {}, treeData = [], coins = 0;

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
    camera.rotation.order = 'YXZ';

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

// COLLISION DETECTION LOGIC
function checkCollision(nextX, nextZ) {
    for (let tree of treeData) {
        let dx = nextX - tree.x;
        let dz = nextZ - tree.z;
        let distance = Math.sqrt(dx * dx + dz * dz);
        if (distance < 0.8) return true; // 0.8 is the combined radius of player + trunk
    }
    return false;
}

setInterval(() => {
    if (controls && controls.isLocked) {
        let currentRY = camera.rotation.y;
        if (camera.position.x !== lastSentPos.x || camera.position.y !== lastSentPos.y || camera.position.z !== lastSentPos.z || Math.abs(currentRY - lastSentPos.ry) > 0.01) {
            socket.emit('move', { x: camera.position.x, y: camera.position.y, z: camera.position.z, ry: currentRY });
            lastSentPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z, ry: currentRY };
        }
    }
}, 50);

// TREE SPAWNING FIX
socket.on('init-trees', (serverTrees) => {
    treeData = serverTrees;
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

socket.on('tree-removed', (id) => { 
    if (treeMeshes[id]) { 
        scene.remove(treeMeshes[id]); 
        delete treeMeshes[id]; 
        treeData = treeData.filter(t => t.id !== id);
    } 
});

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

        // Calculate potential movement
        const moveX = direction.x * speed * delta * delta;
        const moveZ = direction.z * speed * delta * delta;

        // X-Axis Collision
        if (!checkCollision(camera.position.x + (direction.x * 0.5), camera.position.z)) {
            if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;
        } else {
            velocity.x = 0;
        }

        // Z-Axis Collision
        if (!checkCollision(camera.position.x, camera.position.z - (direction.z * 0.5))) {
            if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
        } else {
            velocity.z = 0;
        }

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
