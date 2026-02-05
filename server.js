const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {};
let trees = [];
let forkliftPos = { x: -10, y: 0, z: -10, ry: 0, forkY: 0.5 };

// Seed the world
for (let i = 0; i < 30; i++) {
    trees.push({
        id: "tree_" + i, 
        x: Math.random() * 100 - 50, 
        z: Math.random() * 100 - 50,
        height: 2 + Math.random() * 2, 
        health: 3,
        isGrown: true
    });
}

io.on('connection', (socket) => {
    socket.on('join', (data) => {
        players[socket.id] = { 
            id: socket.id, x: 0, y: 5, z: 0, ry: 0, 
            username: data.username || "Player", 
            coins: 100 
        };
        socket.emit('init-world', { trees, forkliftPos });
        io.emit('leaderboard-update', Object.values(players));
    });

    socket.on('move', (data) => {
        if (players[socket.id]) {
            Object.assign(players[socket.id], data);
            socket.broadcast.emit('player-moved', { id: socket.id, pos: data });
        }
    });

    socket.on('update-forklift', (data) => {
        forkliftPos = data;
        socket.broadcast.emit('forklift-moved', forkliftPos);
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('player-left', socket.id);
    });
});

http.listen(3000, () => console.log('Lumber Sim: http://localhost:3000'));
