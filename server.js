const express = require('express');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let trees = [];
let worldTime = 0;

// Forest Setup
for (let i = 0; i < 40; i++) {
    trees.push({
        id: i, x: Math.random() * 100 - 50, z: Math.random() * 100 - 50,
        height: 1.5 + Math.random() * 2, isGrown: true, createdAt: Date.now() - 60000 
    });
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join', (data) => {
        // Create the player object
        players[socket.id] = { 
            x: 0, y: 1.6, z: 0, ry: 0, 
            username: data.username || "Guest", 
            color: Math.floor(Math.random()*16777215).toString(16) 
        };
        
        // 1. Send trees to the new player
        socket.emit('init-trees', trees);
        
        // 2. Send the current list of ALL players to the new player
        socket.emit('current-players', players);
        
        // 3. Tell everyone else about this new player
        socket.broadcast.emit('new-player', { id: socket.id, info: players[socket.id] });
    });

    socket.on('move', (data) => {
        if (players[socket.id]) {
            Object.assign(players[socket.id], data);
            // Broadcast movement to everyone else
            socket.broadcast.emit('player-moved', { id: socket.id, pos: data });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        io.emit('player-left', socket.id);
    });

    // ... (Keep existing click-tree, drop-log, etc.) ...
    socket.on('click-tree', (id) => {
        const index = trees.findIndex(t => t.id === id);
        if (index !== -1 && trees[index].isGrown) {
            trees.splice(index, 1);
            io.emit('tree-removed', id);
            socket.emit('gain-log');
        }
    });
});

http.listen(3000, () => console.log('Multiplayer Server Running on Port 3000'));
