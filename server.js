const express = require('express');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let trees = [];
let forkliftPos = { x: -10, y: 0, z: -10, ry: 0, forkY: 0.5 };

// Initial Forest Generation
for (let i = 0; i < 40; i++) {
    trees.push({
        id: "tree_" + i, 
        x: Math.random() * 100 - 50, 
        z: Math.random() * 100 - 50,
        height: 1.5 + Math.random() * 2, 
        isGrown: true, 
        createdAt: Date.now() - 60000, 
        health: 3
    });
}

io.on('connection', (socket) => {
    socket.on('join', (data) => {
        players[socket.id] = { 
            id: socket.id, 
            x: 0, y: 5.0, z: 0, ry: 0, 
            username: data.username || "Guest", 
            color: Math.floor(Math.random()*16777215).toString(16),
            coins: 100 
        };
        // Send world data immediately
        socket.emit('init-trees', trees);
        socket.emit('current-players', players);
        socket.emit('init-forklift', forkliftPos);
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

    socket.on('click-tree', (id) => {
        const index = trees.findIndex(t => String(t.id) === String(id));
        if (index !== -1 && trees[index].isGrown) {
            trees[index].health--;
            if (trees[index].health <= 0) {
                trees.splice(index, 1);
                io.emit('tree-removed', id);
                socket.emit('gain-log');
            } else {
                io.emit('tree-damaged', { id: id, health: trees[index].health });
            }
        }
    });

    socket.on('sell-lumber', () => {
        if(players[socket.id]) {
            players[socket.id].coins += 25;
            socket.emit('payment', 25);
            io.emit('leaderboard-update', Object.values(players));
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('player-left', socket.id);
    });
});

http.listen(3000, () => console.log('Lumber Sim Live!'));
