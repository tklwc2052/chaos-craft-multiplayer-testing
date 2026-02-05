const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

app.use(express.static('public'));

let players = {};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Create a new player with a random color
    players[socket.id] = {
        x: 0, y: 0, z: 0,
        username: "Guest",
        color: Math.floor(Math.random()*16777215).toString(16)
    };

    socket.on('join', (data) => {
        players[socket.id].username = data.username || "Guest";
        io.emit('update-players', players);
    });

    socket.on('move', (position) => {
        if (players[socket.id]) {
            players[socket.id].x = position.x;
            players[socket.id].y = position.y;
            players[socket.id].z = position.z;
            socket.broadcast.emit('player-moved', { id: socket.id, pos: position });
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('player-left', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
