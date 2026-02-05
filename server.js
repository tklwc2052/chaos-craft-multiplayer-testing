const express = require('express');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let trees = [];
let worldTime = 0;

// Initial forest generation
for (let i = 0; i < 40; i++) {
    trees.push({
        id: "tree_" + i, 
        x: Math.random() * 100 - 50, 
        z: Math.random() * 100 - 50,
        height: 1.5 + Math.random() * 2, 
        isGrown: true, 
        createdAt: Date.now() - 60000 
    });
}

// Day/Night cycle
setInterval(() => {
    worldTime++;
    if (worldTime >= 1200) worldTime = 0;
    io.emit('time-sync', worldTime);
}, 1000);

io.on('connection', (socket) => {
    socket.on('join', (data) => {
        players[socket.id] = { 
            x: 0, y: 1.6, z: 0, ry: 0, 
            username: data.username || "Guest", 
            color: Math.floor(Math.random()*16777215).toString(16) 
        };
        socket.emit('init-trees', trees);
        socket.emit('current-players', players);
        socket.broadcast.emit('new-player', { id: socket.id, info: players[socket.id] });
    });

    socket.on('move', (data) => {
        if (players[socket.id]) {
            Object.assign(players[socket.id], data);
            socket.broadcast.emit('player-moved', { id: socket.id, pos: data });
        }
    });

    socket.on('click-tree', (id) => {
        const index = trees.findIndex(t => t.id == id);
        if (index !== -1 && trees[index].isGrown) {
            trees.splice(index, 1);
            io.emit('tree-removed', id);
            socket.emit('gain-log');
        }
    });

    socket.on('place-tree', (pos) => {
        const newTree = { 
            id: "tree_" + Date.now(), 
            x: pos.x, z: pos.z, 
            height: 1.5 + Math.random() * 2, 
            isGrown: false, createdAt: Date.now() 
        };
        trees.push(newTree);
        io.emit('tree-added', newTree);
    });

    socket.on('drop-log', () => {
        io.emit('animate-log-belt'); 
        setTimeout(() => { socket.emit('lumber-ready'); }, 10000);
    });

    socket.on('sell-lumber', () => {
        socket.emit('payment', 25); // Challenging economy
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('player-left', socket.id);
    });
});

http.listen(3000, () => console.log('Server running on port 3000'));
