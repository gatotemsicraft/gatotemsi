const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

const players = {};
const leaderboard = [];

io.on('connection', (socket) => {
    console.log(`Player Connected: ${socket.id}`);

    // Inisialisasi Player Baru
    players[socket.id] = {
        id: socket.id,
        name: `Fisherman_${socket.id.substring(0, 4)}`,
        x: 400,
        y: 300,
        skin: null, // Base64 PNG 16x16
        coins: 100,
        title: "Angler Novice",
        caughtFishCount: 0,
        rodLevel: 1
    };

    // Kirim data pemain aktif ke pemain baru
    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // Update Posisi Gerak
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // Custom Skin Upload (16x16 PNG Data URL)
    socket.on('uploadSkin', (skinBase64) => {
        if (players[socket.id]) {
            players[socket.id].skin = skinBase64;
            io.emit('skinUpdated', { id: socket.id, skin: skinBase64 });
        }
    });

    // Chat System
    socket.on('sendChat', (msg) => {
        if (players[socket.id]) {
            io.emit('chatMessage', { sender: players[socket.id].name, text: msg });
        }
    });

    // Mancing & Gacha Logic
    socket.on('tryFish', () => {
        const fishList = [
            { name: "Lele Pixel", rarity: "Common", value: 10, chance: 0.5 },
            { name: "Nila Pelangi", rarity: "Rare", value: 50, chance: 0.3 },
            { name: "Emas Giant", rarity: "Epic", value: 200, chance: 0.15 },
            { name: "Naga Leviathan", rarity: "Legendary", value: 1000, chance: 0.05 }
        ];

        const rand = Math.random();
        let cumulative = 0;
        let caught = fishList[0];

        for (let fish of fishList) {
            cumulative += fish.chance;
            if (rand <= cumulative) {
                caught = fish;
                break;
            }
        }

        players[socket.id].coins += caught.value;
        players[socket.id].caughtFishCount += 1;

        // Check Achievement / Title Unlock
        if (players[socket.id].caughtFishCount >= 10 && players[socket.id].title === "Angler Novice") {
            players[socket.id].title = "Master Pemancing";
        }

        socket.emit('fishCaught', { 
            fish: caught, 
            totalCoins: players[socket.id].coins,
            title: players[socket.id].title,
            count: players[socket.id].caughtFishCount
        });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
