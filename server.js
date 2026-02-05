const express = require('express');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let players = {};

// THE FORKLIFT STATE
let forklift = {
    x: 0, 
    y: 0, 
    z: 0, 
    ry: 0, 
    forkHeight: 0.1, // Default height
    driverId: null 
};

io.on('connection', (socket) => {
    // 1. Initialize new player
    players[socket.id] = { 
        x: 0, y: 1.6, z: 0, ry: 0, 
        username: "Guest", 
        color: Math.floor(Math.random()*16777215).toString(16) 
    };

    // 2. Send INITIAL STATE
    socket.emit('init-game', { players, forklift });

    // 3. Handle Join
    socket.on('join', (data) => {
        if(players[socket.id]) {
            players[socket.id].username = data.username || "Player";
            // Random spawn around center
            players[socket.id].x = Math.random() * 10 - 5; 
            players[socket.id].y = 1.6;
            players[socket.id].z = Math.random() * 10 - 5;
            io.emit('update-players', players);
        }
    });

    // 4. Handle Player Movement
    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].ry = data.ry; 
            socket.broadcast.emit('player-moved', { id: socket.id, pos: data });
        }
    });

    // 5. Handle Forklift Logic
    socket.on('request-drive', () => {
        if (forklift.driverId === null) {
            forklift.driverId = socket.id;
            io.emit('driver-status', { driverId: socket.id });
        }
    });

    socket.on('leave-seat', () => {
        if (forklift.driverId === socket.id) {
            forklift.driverId = null;
            io.emit('driver-status', { driverId: null });
        }
    });

    socket.on('move-forklift', (data) => {
        if (forklift.driverId === socket.id) {
            forklift.x = data.x;
            forklift.z = data.z;
            forklift.ry = data.ry;
            forklift.forkHeight = data.forkHeight;
            socket.broadcast.emit('update-forklift', forklift);
        }
    });

    // 6. Disconnect
    socket.on('disconnect', () => {
        delete players[socket.id];
        if (forklift.driverId === socket.id) {
            forklift.driverId = null;
            io.emit('driver-status', { driverId: null });
        }
        io.emit('player-left', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
