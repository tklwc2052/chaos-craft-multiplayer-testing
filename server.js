const express = require('express');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let trees = [];

for (let i = 0; i < 20; i++) {
    trees.push({
        id: i,
        x: Math.random() * 60 - 30,
        z: Math.random() * 60 - 30
    });
}

io.on('connection', (socket) => {
    // Force absolute spawn at center
    players[socket.id] = { 
        x: 0, y: 1.6, z: 0, ry: 0, 
        username: "Guest", 
        color: Math.floor(Math.random()*16777215).toString(16) 
    };

    socket.emit('init-trees', trees);

    socket.on('join', (data) => {
        if(players[socket.id]) {
            players[socket.id].username = data.username || "Player";
            // Reset to spawn point on join
            players[socket.id].x = 0;
            players[socket.id].y = 1.6;
            players[socket.id].z = 0;
            players[socket.id].ry = 0;
            io.emit('update-players', players);
        }
    });

    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].ry = data.ry; 
            socket.broadcast.emit('player-moved', { id: socket.id, pos: data });
        }
    });

    socket.on('click-tree', (treeId) => {
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
