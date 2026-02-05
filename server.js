const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static('public'));

let players = {};
let trees = [];

// Generate trees on server start
for (let i = 0; i < 15; i++) {
    trees.push({
        id: i,
        x: Math.random() * 40 - 20,
        z: Math.random() * 40 - 20
    });
}

io.on('connection', (socket) => {
    players[socket.id] = { x: 0, y: 1.6, z: 0, username: "Guest", color: Math.floor(Math.random()*16777215).toString(16) };

    // Send existing trees to new player
    socket.emit('init-trees', trees);

    socket.on('join', (data) => {
        players[socket.id].username = data.username || "Guest";
        io.emit('update-players', players);
    });

    socket.on('move', (pos) => {
        if (players[socket.id]) {
            players[socket.id].x = pos.x;
            players[socket.id].y = pos.y;
            players[socket.id].z = pos.z;
            socket.broadcast.emit('player-moved', { id: socket.id, pos });
        }
    });

    socket.on('click-tree', (treeId) => {
        // Remove tree and tell everyone
        trees = trees.filter(t => t.id !== treeId);
        io.emit('tree-removed', treeId);
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('player-left', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
