const socket = io();
let scene, camera, renderer, controls, raycaster;
let sun, ambientLight, stars;

// State
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let velocity = new THREE.Vector3(), direction = new THREE.Vector3();
let canJump = false;
let coins = 100, saplings = 0, logs = 0, lumberReadyCount = 0, selectedSlot = 1;
let treeMeshes = {}, otherPlayers = {}, activeLogsOnBelt = [], lumberStackMeshes = [], smokeParticles = [];
let isMillProcessing = false;

const REACH_DISTANCE = 5.0, GRAVITY = 24.0, JUMP_FORCE = 10.0;

window.buySapling = function() {
    if (coins >= 20) { coins -= 20; saplings++; updateUI(); }
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

    // Lighting & Ground
    ambientLight = new THREE.HemisphereLight(0xddeeff, 0x2d4c1e, 0.4);
    scene.add(ambientLight);
    sun = new THREE.DirectionalLight(0xffffff, 0.8);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshPhongMaterial({color: 0x2d4c1e}));
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
    const belt = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.2, 1.2), new THREE.MeshPhongMaterial({color: 0x111111}));
    belt.position.set(4.2, 0.5, 0);
    mill.add(belt);
    scene.add(mill);

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for(let i=0; i<2000; i++) starPos.push((Math.random()-0.5)*1000, Math.random()*500, (Math.random()-0.5)*1000);
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    stars = new THREE.Points(starGeo, new THREE.PointsMaterial({color: 0xffffff}));
    scene.add(stars);

    // Listeners
    window.addEventListener('keydown', (e) => {
        if (e.key === '1') { selectedSlot = 1; updateUI(); }
        if (e.key === '2') { selectedSlot = 2; updateUI(); }
        if (e.key === '3') { selectedSlot = 3; updateUI(); }
        if(e.code==='KeyW') moveForward=true; if(e.code==='KeyS') moveBackward=true;
        if(e.code==='KeyA') moveLeft=true; if(e.code==='KeyD') moveRight=true;
        if(e.code==='Space' && canJump) { velocity.y = JUMP_FORCE; canJump = false; }
    });
    window.addEventListener('keyup', (e) => {
        if(e.code==='KeyW') moveForward=false; if(e.code==='KeyS') moveBackward=false;
        if(e.code==='KeyA') moveLeft=false; if(e.code==='KeyD') moveRight=false;
    });
    document.addEventListener('mousedown', (e) => {
        if (!controls.isLocked) { controls.lock(); return; }
        if (e.button === 0) { if (selectedSlot === 1) checkTreeClick(); if (selectedSlot === 3) checkMillInteraction(); }
        if (e.button === 2 && selectedSlot === 2) placeSapling();
    });

    animate();
}

function updateUI() {
    document.getElementById('coinDisplay').innerText = coins;
    document.getElementById('saplingDisplay').innerText = saplings;
    document.getElementById('logDisplay').innerText = logs;
    document.getElementById('lumberReadyDisplay').innerText = lumberReadyCount;
    document.getElementById('slot1').classList.toggle('active', selectedSlot === 1);
    document.getElementById('slot2').classList.toggle('active', selectedSlot === 2);
    document.getElementById('slot3').classList.toggle('active', selectedSlot === 3);
}

function createOtherPlayerMesh(id, info) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 0.6), new THREE.MeshStandardMaterial({color: parseInt(info.color,16)}));
    body.position.y = 0.6; group.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({color: parseInt(info.color,16)}));
    head.position.y = 1.45; group.add(head);
    const eyeGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const eyeMat = new THREE.MeshBasicMaterial({color: 0x000000});
    const lEye = new THREE.Mesh(eyeGeo, eyeMat); lEye.position.set(-0.15, 1.5, 0.26); group.add(lEye);
    const rEye = new THREE.Mesh(eyeGeo, eyeMat); rEye.position.set(0.15, 1.5, 0.26); group.add(rEye);
    group.position.set(info.x, info.y - 0.8, info.z);
    scene.add(group); otherPlayers[id] = group;
}

// Stacking Criss-Cross
socket.on('lumber-ready', () => {
    lumberReadyCount++; updateUI(); isMillProcessing = false;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.25, 1.2), new THREE.MeshLambertMaterial({color: 0xe3c18d}));
    const stackIndex = lumberStackMeshes.length;
    const layer = Math.floor(stackIndex / 3);
    const idx = stackIndex % 3;
    const y = 0.22 + (layer * 0.27);
    if (layer % 2 === 0) { plank.position.set(-6 + (idx * 0.85 - 0.85), y, 0); } 
    else { plank.position.set(-6, y, idx * 0.85 - 0.85); plank.rotation.y = Math.PI/2; }
    scene.add(plank); lumberStackMeshes.push(plank);
});

socket.on('animate-log-belt', () => {
    isMillProcessing = true;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5), new THREE.MeshLambertMaterial({color: 0x8B4513}));
    log.rotation.z = Math.PI/2; log.position.set(6, 0.8, 0);
    scene.add(log); activeLogsOnBelt.push(log);
});

// Sync Listeners
socket.on('init-trees', (data) => { data.forEach(t => addTreeToScene(t)); });
socket.on('current-players', (p) => { Object.keys(p).forEach(id => { if(id!==socket.id) createOtherPlayerMesh(id, p[id]); })});
socket.on('new-player', (d) => { if(!otherPlayers[d.id]) createOtherPlayerMesh(d.id, d.info); });
socket.on('player-moved', (d) => { if(otherPlayers[d.id]){ otherPlayers[d.id].position.set(d.pos.x, d.pos.y-0.8, d.pos.z); otherPlayers[d.id].rotation.y=d.pos.ry; }});
socket.on('tree-added', (t) => addTreeToScene(t));
socket.on('tree-removed', (id) => { if(treeMeshes[id]){ scene.remove(treeMeshes[id]); delete treeMeshes[id]; }});
socket.on('gain-log', () => { logs++; updateUI(); });
socket.on('payment', (a) => { coins += a; updateUI(); });

function addTreeToScene(t) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.8, t.height, 0.8), new THREE.MeshLambertMaterial({color: 0x8B4513}));
    trunk.position.y = t.height/2;
    const leaves = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshLambertMaterial({color: 0x228B22}));
    leaves.position.y = t.height+1;
    group.add(trunk, leaves); group.position.set(t.x, 0, t.z);
    group.userData = { treeId: t.id, createdAt: t.createdAt, isGrown: t.isGrown };
    if(!t.isGrown) group.scale.set(0.1, 0.1, 0.1);
    scene.add(group); treeMeshes[t.id] = group;
}

function checkTreeClick() {
    raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
    const hits = raycaster.intersectObjects(Object.values(treeMeshes), true);
    if(hits.length > 0 && hits[0].distance < REACH_DISTANCE) {
        let o = hits[0].object; while(o.parent && !o.userData.treeId) o = o.parent;
        if(o.userData.treeId && o.userData.isGrown) socket.emit('click-tree', o.userData.treeId);
    }
}

function checkMillInteraction() {
    raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    if(hits.length > 0 && hits[0].distance < REACH_DISTANCE) {
        const o = hits[0].object;
        if(o.userData.isHopper && logs > 0) { logs--; socket.emit('drop-log'); updateUI(); }
        if((o.userData.isPallet || lumberStackMeshes.includes(o)) && lumberReadyCount > 0) {
            const p = lumberStackMeshes.pop(); if(p) scene.remove(p);
            lumberReadyCount--; socket.emit('sell-lumber'); updateUI();
        }
    }
}

function placeSapling() {
    if(saplings <= 0) return;
    raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
    const hits = raycaster.intersectObjects(scene.children);
    const g = hits.find(i => i.object.geometry.type === "PlaneGeometry");
    if(g && g.distance < REACH_DISTANCE) { socket.emit('place-tree', {x: g.point.x, z: g.point.z}); saplings--; updateUI(); }
}

function animate() {
    requestAnimationFrame(animate);
    let delta = 0.016;

    activeLogsOnBelt.forEach((l, i) => { l.position.x -= 0.05; if(l.position.x < 2){ scene.remove(l); activeLogsOnBelt.splice(i,1); }});
    if(isMillProcessing) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshBasicMaterial({color: 0x888888, transparent:true, opacity:0.6}));
        p.position.set(0, 5, 0); scene.add(p); smokeParticles.push({m:p, l:1.0});
    }
    for(let i=smokeParticles.length-1; i>=0; i--) {
        let s = smokeParticles[i]; s.m.position.y += 0.04; s.l -= 0.02; s.m.material.opacity = s.l;
        if(s.l <= 0){ scene.remove(s.m); smokeParticles.splice(i,1); }
    }

    Object.values(treeMeshes).forEach(m => {
        if(m.userData && !m.userData.isGrown) {
            const p = Math.min((Date.now() - m.userData.createdAt)/60000, 1);
            m.scale.set(0.1+0.9*p, 0.1+0.9*p, 0.1+0.9*p);
            if(p >= 1) m.userData.isGrown = true;
        }
    });

    if (controls.isLocked) {
        velocity.x -= velocity.x * 10.0 * delta; velocity.z -= velocity.z * 10.0 * delta; velocity.y -= GRAVITY * delta;
        direction.z = Number(moveForward) - Number(moveBackward); direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();
        if(moveForward || moveBackward) velocity.z -= direction.z * 400.0 * delta;
        if(moveLeft || moveRight) velocity.x -= direction.x * 400.0 * delta;
        controls.moveRight(-velocity.x * delta); controls.moveForward(-velocity.z * delta);
        camera.position.y += (velocity.y * delta);
        if(camera.position.y < 1.6){ velocity.y = 0; camera.position.y = 1.6; canJump = true; }
        if(Date.now()%30<20) socket.emit('move', {x:camera.position.x, y:camera.position.y, z:camera.position.z, ry:camera.rotation.y});
    }
    renderer.render(scene, camera);
}
