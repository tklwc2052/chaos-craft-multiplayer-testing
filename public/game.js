const socket = io();
let scene, camera, renderer, controls, raycaster;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, isShifting = false;
let velocity = new THREE.Vector3(), direction = new THREE.Vector3();
let otherPlayers = {}, treeMeshes = {}, treeData = [], coins = 0;

// Physics & Breaking Config
const GRAVITY = 24.0; 
const JUMP_FORCE = 10.0; 
const BREAK_TIME = 5000; 
const REACH_DISTANCE = 4.5;
let canJump = false;
let lastSentPos = { x: 0, y: 0, z: 0, ry: 0 };

let breakTimer = 0;
let isBreaking = false;
let currentTargetTree = null;

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
    
    document.addEventListener('mousedown', (e) => {
        if (controls.isLocked && e.button === 0) startBreaking();
    });
    document.addEventListener('mouseup', stopBreaking);
    
    document.addEventListener('click', () => { if (!controls.isLocked) controls.lock(); });

    raycaster = new THREE.Raycaster();
    scene.add(new THREE.HemisphereLight(0xeeeeff, 0x777788, 1));
    
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshPhongMaterial({color: 0x567d46}));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    window.addEventListener('keydown', (e) => {
        if(e.code==='KeyW') moveForward=true; if(e.code==='KeyS') moveBackward=true;
        if(e.code==='KeyA') moveLeft=true; if(e.code==='KeyD') moveRight=true;
        if(e.shiftKey) isShifting = true;
        if(e.code==='Space' && canJump) { velocity.y = JUMP_FORCE; canJump = false; }
    });
    window.addEventListener('keyup', (e) => {
        if(e.code==='KeyW') moveForward=false; if(e.code==='KeyS') moveBackward=false;
        if(e.code==='KeyA') moveLeft=false; if(e.code==='KeyD') moveRight=false;
        if(!e.shiftKey) isShifting = false;
    });

    animate();
}

function startBreaking() {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(Object.values(treeMeshes), true);
    if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj.parent && obj.userData.treeId === undefined) obj = obj.parent;
        if (obj.userData.treeId !== undefined && intersects[0].distance < REACH_DISTANCE) {
            isBreaking = true;
            currentTargetTree = obj.userData.treeId;
            breakTimer = 0;
            document.getElementById('breakingBarContainer').style.display = 'block';
        }
    }
}

function stopBreaking() {
    if (currentTargetTree && treeMeshes[currentTargetTree]) {
        treeMeshes[currentTargetTree].rotation.z = 0; // Reset shake
    }
    isBreaking = false;
    currentTargetTree = null;
    breakTimer = 0;
    document.getElementById('breakingBar').style.width = '0%';
    document.getElementById('breakingBarContainer').style.display = 'none';
}

function isColliding(x, z) {
    for (let tree of treeData) {
        let dist = Math.sqrt((x - tree.x)**2 + (z - tree.z)**2);
        if (dist < 0.75) return true; 
    }
    return false;
}

function animate() {
    requestAnimationFrame(animate);
    let delta = 0.016;

    if (controls.isLocked) {
        // BREAKING PROGRESS
        if (isBreaking && currentTargetTree !== null && treeMeshes[currentTargetTree]) {
            breakTimer += delta * 1000;
            let progress = (breakTimer / BREAK_TIME) * 100;
            document.getElementById('breakingBar').style.width = progress + '%';
            
            // Shake Effect
            treeMeshes[currentTargetTree].rotation.z = Math.sin(Date.now() * 0.02) * 0.02;

            if (breakTimer >= BREAK_TIME) {
                socket.emit('click-tree', currentTargetTree);
                coins += 100;
                document.getElementById('coinDisplay').innerText = coins;
                stopBreaking();
            }
        }

        // MOVEMENT & PHYSICS
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

        let nextX = camera.position.x - (velocity.x * delta);
        let nextZ = camera.position.z - (velocity.z * delta);

        if (!isColliding(nextX, camera.position.z)) controls.moveRight(-velocity.x * delta);
        if (!isColliding(camera.position.x, nextZ)) controls.moveForward(-velocity.z * delta);

        camera.position.y += (velocity.y * delta);
        if (camera.position.y < targetHeight) {
            velocity.y = 0;
            camera.position.y = targetHeight;
            canJump = true;
        }
    }
    renderer.render(scene, camera);
}

// MULTIPLAYER SYNC
setInterval(() => {
    if (controls && controls.isLocked) {
        socket.emit('move', { x: camera.position.x, y: camera.position.y, z: camera.position.z, ry: camera.rotation.y });
    }
}, 50);

socket.on('init-trees', (serverTrees) => {
    treeData = serverTrees;
    serverTrees.forEach(t => {
        const group = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.8, t.height, 0.8), new THREE.MeshLambertMaterial({color: 0x8B4513}));
        trunk.position.y = t.height / 2;
        const leaves = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshLambertMaterial({color: 0x228B22}));
        leaves.position.y = t.height + 1;
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
            const group = new THREE.Group();
            group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ color: parseInt(serverPlayers[id].color, 16) })));
            scene.add(group);
            otherPlayers[id] = group;
        }
    });
});

socket.on('player-moved', (data) => { if (otherPlayers[data.id]) { otherPlayers[data.id].position.set(data.pos.x, data.pos.y - 0.8, data.pos.z); otherPlayers[data.id].rotation.y = data.pos.ry; } });
socket.on('player-left', (id) => { if (otherPlayers[id]) { scene.remove(otherPlayers[id]); delete otherPlayers[id]; } });
socket.on('tree-removed', (id) => { if (treeMeshes[id]) { scene.remove(treeMeshes[id]); delete treeMeshes[id]; treeData = treeData.filter(t => t.id !== id); } });
