const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Sajikan file statis dari folder public
app.use(express.static('public'));

const players = {};

io.on('connection', (socket) => {
    console.log('Pemain terhubung:', socket.id);

    // Buat pemain baru saat terhubung
    players[socket.id] = {
        x: Math.floor(Math.random() * 400) + 50,
        y: Math.floor(Math.random() * 400) + 50,
        color: '#' + Math.floor(Math.random()*16777215).toString(16)
    };

    // Kirim data semua pemain ke pemain yang baru masuk
    io.emit('updatePlayers', players);

    // Tangani pergerakan pemain
    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x += data.x;
            players[socket.id].y += data.y;
            io.emit('updatePlayers', players);
        }
    });

    // Tangani pemain keluar
    socket.on('disconnect', () => {
        console.log('Pemain terputus:', socket.id);
        delete players[socket.id];
        io.emit('updatePlayers', players);
    });
});

// Railway akan menyediakan port secara otomatis melalui process.env.PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});
