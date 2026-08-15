const socket = io();
let otherPlayers = {};
let player;
let cursors;

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: window.innerWidth,
    height: window.innerHeight,
    pixelArt: true,
    physics: { default: 'arcade', arcade: { gravity: { y: 0 } } },
    scene: { preload: preload, create: create, update: update }
};

const game = new Phaser.Game(config);

function preload() {
    // Memuat aset 2D Pixel Tile & Sprite langsung via Open CDN (Tanpa perlu upload lokal)
    this.load.image('tiles', 'https://labs.phaser.io/assets/tilemaps/tiles/catastrophi_tiles.png');
    this.load.image('defaultSkin', 'https://labs.phaser.io/assets/sprites/space-baddie.png');
    this.load.image('water', 'https://labs.phaser.io/assets/skies/underwater1.png');
}

function create() {
    const self = this;
    this.otherPlayersGroup = this.physics.add.group();

    // Map Sederhana (Area Darat & Sungai)
    this.add.rectangle(400, 300, 800, 600, 0x2e8b57); // Daratan / Rumput
    const water = this.add.rectangle(650, 300, 300, 600, 0x1e90ff); // Sungai Tempat Mancing
    this.physics.add.existing(water, true);

    cursors = this.input.keyboard.createCursorKeys();

    // Spawn Player Sendiri
    socket.on('currentPlayers', (players) => {
        Object.keys(players).forEach((id) => {
            if (id === socket.id) {
                addPlayer(self, players[id]);
            } else {
                addOtherPlayers(self, players[id]);
            }
        });
    });

    socket.on('newPlayer', (playerInfo) => {
        addOtherPlayers(self, playerInfo);
    });

    socket.on('playerDisconnected', (id) => {
        if (otherPlayers[id]) {
            otherPlayers[id].destroy();
            delete otherPlayers[id];
        }
    });

    socket.on('playerMoved', (playerInfo) => {
        if (otherPlayers[playerInfo.id]) {
            otherPlayers[playerInfo.id].setPosition(playerInfo.x, playerInfo.y);
        }
    });

    // Handle Live Skin Custom Upload Update
    socket.on('skinUpdated', (data) => {
        let key = `skin_${data.id}_${Date.now()}`;
        self.textures.addBase64(key, data.skin);
        self.textures.once('onload', () => {
            if (data.id === socket.id && player) {
                player.setTexture(key);
                player.setDisplaySize(32, 32);
            } else if (otherPlayers[data.id]) {
                otherPlayers[data.id].setTexture(key);
                otherPlayers[data.id].setDisplaySize(32, 32);
            }
        });
    });

    // Chat Event
    socket.on('chatMessage', (data) => {
        const chatBox = document.getElementById('chat-box');
        chatBox.innerHTML += `<div><b>${data.sender}:</b> ${data.text}</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
    });

    // Catch Fish Notification
    socket.on('fishCaught', (data) => {
        document.getElementById('coin-val').innerText = data.totalCoins;
        document.getElementById('fish-val').innerText = data.count;
        document.getElementById('player-title').innerText = data.title;
        alert(`🎣 Dapat Ikan! Nama: ${data.fish.name} (${data.fish.rarity}) | Profit: +${data.fish.value} Gold`);
    });
}

function addPlayer(scene, playerInfo) {
    player = scene.physics.add.sprite(playerInfo.x, playerInfo.y, 'defaultSkin').setDisplaySize(32, 32);
    player.setCollideWorldBounds(true);
}

function addOtherPlayers(scene, playerInfo) {
    const otherPlayer = scene.add.sprite(playerInfo.x, playerInfo.y, 'defaultSkin').setDisplaySize(32, 32);
    otherPlayer.id = playerInfo.id;
    otherPlayers[playerInfo.id] = otherPlayer;
}

function update() {
    if (!player) return;

    let speed = 160;
    let moved = false;

    player.body.setVelocity(0);

    if (cursors.left.isDown) {
        player.body.setVelocityX(-speed);
        moved = true;
    } else if (cursors.right.isDown) {
        player.body.setVelocityX(speed);
        moved = true;
    }

    if (cursors.up.isDown) {
        player.body.setVelocityY(-speed);
        moved = true;
    } else if (cursors.down.isDown) {
        player.body.setVelocityY(speed);
        moved = true;
    }

    if (moved) {
        socket.emit('playerMovement', { x: player.x, y: player.y });
    }
}

// Global UI Interaction
function castRod() {
    if (player.x > 500) { // Cek jika berada di dekat area sungai (x > 500)
        socket.emit('tryFish');
    } else {
        alert("Jalan dulu ke tepi sungai di sebelah kanan!");
    }
}

function sendChat() {
    const input = document.getElementById('chatInput');
    if (input.value.trim() !== '') {
        socket.emit('sendChat', input.value);
        input.value = '';
    }
}

function uploadSkin(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            socket.emit('uploadSkin', e.target.result);
        };
        reader.readAsDataURL(file);
    }
}
