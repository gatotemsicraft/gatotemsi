const socket = io();
let player, cursors;
let otherPlayers = {};

// State Mancing
let isFishing = false;
let isMiniGameActive = false;
let fishPosition = 50;   // 0 - 100
let catchBarPosition = 40; // 0 - 100
let catchBarSize = 25;    // Ukuran bar hijau
let catchProgress = 30;   // 0 - 100
let fishVelocity = 0;
let targetFish = null;

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: '100%',
        height: '100%'
    },
    pixelArt: true,
    physics: { default: 'arcade', arcade: { gravity: { y: 0 } } },
    scene: { preload: preload, create: create, update: update }
};

const game = new Phaser.Game(config);

function preload() {
    this.load.image('defaultSkin', 'https://labs.phaser.io/assets/sprites/space-baddie.png');
}

function create() {
    const self = this;
    this.otherPlayersGroup = this.physics.add.group();

    // Map Sederhana: Land & Water Zone
    this.add.rectangle(300, 400, 600, 800, 0x388e3c); // Land
    this.add.rectangle(750, 400, 300, 800, 0x0288d1); // River

    cursors = this.input.keyboard.createCursorKeys();
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Socket Event Handling
    socket.on('currentPlayers', (players) => {
        Object.keys(players).forEach((id) => {
            if (id === socket.id) addPlayer(self, players[id]);
            else addOtherPlayers(self, players[id]);
        });
    });

    socket.on('newPlayer', (info) => addOtherPlayers(self, info));
    socket.on('playerDisconnected', (id) => {
        if (otherPlayers[id]) {
            otherPlayers[id].destroy();
            delete otherPlayers[id];
        }
    });

    socket.on('playerMoved', (info) => {
        if (otherPlayers[info.id]) otherPlayers[info.id].setPosition(info.x, info.y);
    });

    // UI Graphics untuk Mini-Game Mancing
    this.uiContainer = this.add.container(400, 300).setDepth(100).setVisible(false);
    
    // Background Frame Mini-game
    const bgFrame = this.add.rectangle(0, 0, 80, 220, 0x1e293b).setStrokeStyle(3, 0x94a3b8);
    
    // Water Bar Track
    const track = this.add.rectangle(-15, 0, 30, 180, 0x0f172a);
    
    // Catch Bar (Hijau) & Fish Icon
    this.catchBarUI = this.add.rectangle(-15, 50, 28, catchBarSize * 1.8, 0x22c55e);
    this.fishUI = this.add.circle(-15, 0, 8, 0xef4444);

    // Progress Bar (Samping Kanan)
    const progressBg = this.add.rectangle(20, 0, 10, 180, 0x334155);
    this.progressFill = this.add.rectangle(20, 90, 10, 0, 0xeab308).setOrigin(0.5, 1);

    this.uiContainer.add([bgFrame, track, this.catchBarUI, this.fishUI, progressBg, this.progressFill]);

    // Skin Custom Updater Listener
    socket.on('skinUpdated', (data) => {
        let key = `skin_${data.id}_${Date.now()}`;
        self.textures.addBase64(key, data.skin);
        self.textures.once('onload', () => {
            if (data.id === socket.id && player) player.setTexture(key).setDisplaySize(32, 32);
            else if (otherPlayers[data.id]) otherPlayers[data.id].setTexture(key).setDisplaySize(32, 32);
        });
    });
}

function addPlayer(scene, info) {
    player = scene.physics.add.sprite(info.x, info.y, 'defaultSkin').setDisplaySize(32, 32);
    player.setCollideWorldBounds(true);
}

function addOtherPlayers(scene, info) {
    const other = scene.add.sprite(info.x, info.y, 'defaultSkin').setDisplaySize(32, 32);
    otherPlayers[info.id] = other;
}

function update(time, delta) {
    if (!player) return;

    // Movement Player
    if (!isMiniGameActive) {
        let speed = 160;
        let moved = false;
        player.body.setVelocity(0);

        if (cursors.left.isDown) { player.body.setVelocityX(-speed); moved = true; }
        else if (cursors.right.isDown) { player.body.setVelocityX(speed); moved = true; }
        if (cursors.up.isDown) { player.body.setVelocityY(-speed); moved = true; }
        else if (cursors.down.isDown) { player.body.setVelocityY(speed); moved = true; }

        if (moved) socket.emit('playerMovement', { x: player.x, y: player.y });
    }

    // Mini-Game Logic System (Stardew Style)
    if (isMiniGameActive) {
        // 1. Kontrol Catch Bar (Space = Naik, Lepas = Turun)
        if (this.spaceKey.isDown) {
            catchBarPosition = Math.max(0, catchBarPosition - 1.2);
        } else {
            catchBarPosition = Math.min(100 - catchBarSize, catchBarPosition + 1.0);
        }

        // 2. Pergerakan AI Ikan (Acak & Dynamic)
        fishVelocity += (Math.random() - 0.5) * 1.5;
        fishPosition += fishVelocity;
        fishVelocity *= 0.92; // Friction

        if (fishPosition < 0) { fishPosition = 0; fishVelocity *= -1; }
        if (fishPosition > 100) { fishPosition = 100; fishVelocity *= -1; }

        // 3. Cek Tabrakan Ikan dalam Catch Bar
        const isInside = fishPosition >= catchBarPosition && fishPosition <= (catchBarPosition + catchBarSize);

        if (isInside) {
            catchProgress = Math.min(100, catchProgress + 0.35);
        } else {
            catchProgress = Math.max(0, catchProgress - 0.25);
        }

        // 4. Update UI Visual Position
        this.catchBarUI.setY(-90 + catchBarPosition * 1.8 + (catchBarSize * 0.9));
        this.fishUI.setY(-90 + fishPosition * 1.8);
        this.progressFill.height = (catchProgress / 100) * 180;

        // 5. Win / Lose Condition
        if (catchProgress >= 100) {
            finishFishing(true);
        } else if (catchProgress <= 0) {
            finishFishing(false);
        }
    }
}

// Trigger Mulai Mancing
function castRod() {
    if (isFishing || isMiniGameActive) return;

    if (player.x > 450) { // Berada di area tepi air
        isFishing = true;
        console.log("Menunggu ikan menggigit...");

        // Random delay 1.5 - 4 detik sampai ikan makan umpan
        setTimeout(() => {
            if (isFishing) {
                startMiniGame();
            }
        }, 1500 + Math.random() * 2500);
    } else {
        alert("Jalan dulu ke tepi sungai (area biru sebelah kanan)!");
    }
}

function startMiniGame() {
    isMiniGameActive = true;
    catchProgress = 30;
    fishPosition = 50;
    catchBarPosition = 40;

    // Posisi UI melayang tepat di atas kepala pemain
    game.scene.scenes[0].uiContainer.setPosition(player.x, player.y - 120);
    game.scene.scenes[0].uiContainer.setVisible(true);
}

function finishFishing(success) {
    isFishing = false;
    isMiniGameActive = false;
    game.scene.scenes[0].uiContainer.setVisible(false);

    if (success) {
        socket.emit('tryFish'); // Request hadiah dari server
    } else {
        alert("❌ Ikan Lepas! Senar putus atau ikan keburu kabur.");
    }
}
