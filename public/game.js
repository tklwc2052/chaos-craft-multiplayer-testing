const socket = io();
let scene, camera, renderer, myId;
let otherPlayers = {};

function joinGame() {
    const name = document.getElementById('usernameInput').value;
    document.getElementById('userNameDisplay').innerText = name;
    document.getElementById('login').style.display = 'none';
    
    init3D();
    socket.emit('join', { username: name });
}

function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Light Blue Sky
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial({color: 0x567d46}));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    camera.position.set(0, 1.6, 5);
    animate();
}

socket.on('update-players', (players) => {
    Object.keys(players).forEach(id => {
        if (id !== socket.id && !otherPlayers[id]) {
            // Create a box for other players with their specific color
            const geometry = new THREE.BoxGeometry(1, 2, 1);
            const material = new THREE.MeshBasicMaterial({ color: parseInt(players[id].color, 16) });
            const mesh = new THREE.Mesh(geometry, material);
            scene.add(mesh);
            otherPlayers[id] = mesh;
        }
    });
});

socket.on('player-left', (id) => {
    if (otherPlayers[id]) {
        scene.remove(otherPlayers[id]);
        delete otherPlayers[id];
    }
});

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    
    // In a real version, send movement data here
    // socket.emit('move', { x: camera.position.x, y: camera.position.y, z: camera.position.z });
}
