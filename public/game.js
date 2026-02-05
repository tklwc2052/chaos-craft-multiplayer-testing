const socket = io();
let scene, camera, renderer, controls, raycaster;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let velocity = new THREE.Vector3(), direction = new THREE.Vector3();
let otherPlayers = {}, treeMeshes = {}, coins = 0;

function joinGame() {
    const name = document.getElementById('usernameInput').value || "Guest";
    document.getElementById('userNameDisplay').innerText = name;
    document.getElementById('login').style.display = 'none';
    init3D();
    socket.emit('join', { username: name });
}

function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    controls = new THREE.PointerLockControls(camera, document.body);
    document.addEventListener('click', () => {
        if (controls.isLocked) {
            checkTreeClick();
        } else {
            controls.lock();
        }
    });

    raycaster = new THREE.Raycaster();
    scene.add(new THREE.HemisphereLight(0xeeeeff, 0x777788, 1));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshPhongMaterial({color: 0x567d46}));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    window.addEventListener('keydown', (e) => { if(e.code==='KeyW') moveForward=true; if(e.code==='KeyS') moveBackward=true; if(e.code==='KeyA') moveLeft=true; if(e.code==='KeyD') moveRight=true; });
    window.addEventListener('keyup', (e) => { if(e.code==='KeyW') moveForward=false; if(e.code==='KeyS') moveBackward=false; if(e.code==='KeyA') moveLeft=false; if(e.code==='KeyD') moveRight=false; });

    camera.position.set(0, 1.6, 5);
    animate();
}

socket.on('init-trees', (serverTrees) => {
    serverTrees.forEach(t => {
        const group = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshLambertMaterial({color: 0x8B4513}));
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

function checkTreeClick() {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(Object.values(treeMeshes), true);
    if (intersects.length > 0) {
        let treeGroup = intersects[0].object.parent;
        let id = treeGroup.userData.treeId;
        socket.emit('click-tree', id);
        coins += 100;
        document.getElementById('coinDisplay').innerText = coins;
    }
}

socket.on('tree-removed', (id) => {
    if (treeMeshes[id]) {
        scene.remove(treeMeshes[id]);
        delete treeMeshes[id];
    }
});

socket.on('update-players', (players) => {
    Object.keys(players).forEach(id => {
        if (id !== socket.id && !otherPlayers[id]) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial({ color: parseInt(players[id].color, 16) }));
            scene.add(mesh);
            otherPlayers[id] = mesh;
        }
    });
});

socket.on('player-moved', (data) => { if (otherPlayers[data.id]) otherPlayers[data.id].position.set(data.pos.x, data.pos.y - 0.8, data.pos.z); });

socket.on('player-left', (id) => { if (otherPlayers[id]) { scene.remove(otherPlayers[id]); delete otherPlayers[id]; } });

function animate() {
    requestAnimationFrame(animate);
    if (controls.isLocked) {
        velocity.x -= velocity.x * 10.0 * 0.15;
        velocity.z -= velocity.z * 10.0 * 0.15;
        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();
        if (moveForward || moveBackward) velocity.z -= direction.z * 400.0 * 0.15;
        if (moveLeft || moveRight) velocity.x -= direction.x * 400.0 * 0.15;
        controls.moveRight(-velocity.x * 0.15);
        controls.moveForward(-velocity.z * 0.15);
        socket.emit('move', { x: camera.position.x, y: camera.position.y, z: camera.position.z });
    }
    renderer.render(scene, camera);
}
