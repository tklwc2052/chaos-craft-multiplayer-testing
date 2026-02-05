const express = require('express');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let players = {};

// THE FORKLIFT STATE
// This is the new part the server needs to know about!
let forklift = {
    x: 0, 
    y: 0, 
    z: 0, 
    ry: 0, 
    forkHeight: 0.1, 
    driverId: null 
};

io.on('connection', (socket) => {
    console.log('A player connected:', socket.id); // Check your terminal for this!

    // Initialize new player
    players[socket.id] = { 
        x: 0, y: 1.6, z: 0, ry: 0, 
        username: "Guest", 
        color: Math.floor(Math.random()*16777215).toString(16) 
    };

    // --- CRITICAL FIX ---
    // This sends the "init-game" signal your screen is waiting for.
    socket.emit('init-game', { players, forklift });
    // --------------------

    socket.on('join', (data) => {
        if(players[socket.id]) {
            players[socket.id].username = data.username || "Player";
            // Random spawn to avoid stacking
            players[socket.id].x = Math.random() * 10 - 5; 
            players[socket.id].y = 1.6;
            players[socket.id].z = Math.random() * 10 - 5;
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

    // Forklift Logic
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

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
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
