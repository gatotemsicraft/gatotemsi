// ===== Mancing Mabar: Game Client =====
// Phaser 3 untuk render pixel game, Socket.IO untuk sinkronisasi multiplayer.

const GAME_W = 640;
const GAME_H = 480;
const MOVE_SPEED = 140;
const SEND_INTERVAL_MS = 80;

const FISHING_SPOTS = [
  { x: 120, y: 340 },
  { x: 320, y: 380 },
  { x: 520, y: 340 },
  { x: 220, y: 420 },
  { x: 420, y: 420 }
];
const FISH_CATCH_RADIUS = 46;

const FISH_TABLE = [
  { name: "Ikan Teri", points: 1, weight: 40, color: 0xbfe6ff },
  { name: "Ikan Nila", points: 3, weight: 30, color: 0x8fd694 },
  { name: "Ikan Mas", points: 5, weight: 18, color: 0xffb56b },
  { name: "Lele Emas", points: 10, weight: 9, color: 0xffe66b },
  { name: "Ikan Legenda 🌟", points: 25, weight: 3, color: 0xd65fb0 }
];

let socket = null;
let game = null;
let selfId = null;
let myName = "Nelayan";
let myRoom = "dermaga-utama";
let mySkinDataURL = null;

// id -> { sprite, nameText, targetX, targetY, facing, score, skinKey }
const remotePlayers = new Map();
let localSprite = null;
let localNameText = null;
let cursors = null;
let keysWASD = null;
let spaceKey = null;
let lastSent = 0;
let isFishing = false;
let fishingUI = null; // Phaser objects group for the minigame indicator
let scoreState = new Map(); // id -> {name, score}

// ---------------------------------------------------------------
// Lobby wiring
// ---------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("joinBtn").addEventListener("click", tryJoin);
  document.getElementById("nameInput").addEventListener("keydown", (e) => { if (e.key === "Enter") tryJoin(); });
  document.getElementById("roomInput").addEventListener("keydown", (e) => { if (e.key === "Enter") tryJoin(); });

  SkinEditor.onSave((dataURL) => { mySkinDataURL = dataURL; });

  document.getElementById("chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if (!text || !socket) return;
    socket.emit("chat", text);
    input.value = "";
  });
});

function tryJoin() {
  const nameVal = document.getElementById("nameInput").value.trim();
  const roomVal = document.getElementById("roomInput").value.trim();
  const errEl = document.getElementById("lobbyError");

  if (!nameVal) {
    errEl.textContent = "Isi nama dulu ya, bro.";
    return;
  }
  myName = nameVal.slice(0, 16);
  myRoom = (roomVal || "dermaga-utama").slice(0, 24);
  mySkinDataURL = SkinEditor.getDataURL();

  document.getElementById("lobby").classList.add("hidden");
  document.getElementById("gameUI").classList.remove("hidden");

  connectSocket();
  startGame();
}

// ---------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------
function connectSocket() {
  // Terhubung ke origin yang sama (server juga menyajikan file client ini).
  socket = io();

  socket.on("connect", () => {
    socket.emit("join", { name: myName, room: myRoom });
  });

  socket.on("init", (data) => {
    selfId = data.selfId;
    data.players.forEach((p) => {
      if (p.id === selfId) return;
      addRemotePlayer(p);
    });
    refreshLeaderboard();
  });

  socket.on("playerJoined", (p) => {
    if (p.id === selfId) return;
    addRemotePlayer(p);
    showToast(`${p.name} nyemplung ke dermaga!`);
    refreshLeaderboard();
  });

  socket.on("playerMoved", ({ id, x, y, facing }) => {
    const rp = remotePlayers.get(id);
    if (!rp) return;
    rp.targetX = x;
    rp.targetY = y;
    rp.facing = facing;
  });

  socket.on("skinUpdated", ({ id, skin }) => {
    if (id === selfId) return;
    applySkinToRemote(id, skin);
  });

  socket.on("scoreUpdated", ({ id, score, fishName }) => {
    const entry = scoreState.get(id) || { name: id === selfId ? myName : (remotePlayers.get(id)?.name || "?"), score: 0 };
    entry.score = score;
    scoreState.set(id, entry);
    refreshLeaderboard();
    if (id === selfId) {
      showToast(`Dapat ${fishName}! +skor`);
    }
  });

  socket.on("chatMessage", ({ id, name, text }) => {
    appendChat(name, text, id === selfId);
  });

  socket.on("playerLeft", ({ id }) => {
    const rp = remotePlayers.get(id);
    if (rp) {
      rp.sprite.destroy();
      rp.nameText.destroy();
      remotePlayers.delete(id);
    }
    scoreState.delete(id);
    refreshLeaderboard();
  });
}

// ---------------------------------------------------------------
// Phaser setup
// ---------------------------------------------------------------
function startGame() {
  const config = {
    type: Phaser.AUTO,
    width: GAME_W,
    height: GAME_H,
    parent: "gameContainer",
    pixelArt: true,
    backgroundColor: "#0a2f45",
    physics: { default: "arcade" },
    scene: { preload, create, update }
  };
  game = new Phaser.Game(config);
}

function preload() {
  // Tidak ada asset eksternal — semua digambar via Phaser Graphics saat runtime.
}

function create() {
  const scene = this;

  // --- Latar: dermaga (atas) & air (bawah) ---
  const g = scene.add.graphics();
  g.fillStyle(0xd8a15b, 1); // pasir/dermaga
  g.fillRect(0, 0, GAME_W, 260);
  g.fillStyle(0x1c5f80, 1); // air
  g.fillRect(0, 260, GAME_W, GAME_H - 260);
  // garis kayu dermaga sederhana
  g.fillStyle(0xb9854a, 1);
  for (let x = 0; x < GAME_W; x += 40) g.fillRect(x, 0, 4, 260);
  // riak air
  g.fillStyle(0x2f7a9e, 0.6);
  for (let i = 0; i < 10; i++) {
    g.fillRect(Phaser.Math.Between(0, GAME_W), 270 + Phaser.Math.Between(0, GAME_H - 280), 24, 2);
  }

  // Titik-titik mancing
  scene.spotGraphics = scene.add.graphics();
  drawFishingSpots(scene);

  // --- Sprite lokal ---
  const startX = 300, startY = 200;
  buildTextureAndSprite(scene, "self", mySkinDataURL, startX, startY, (sprite) => {
    localSprite = sprite;
    localNameText = scene.add.text(sprite.x, sprite.y - 26, myName, textStyle()).setOrigin(0.5);
  });

  // --- Sprite pemain lain yang sudah ada saat kita masuk ---
  remotePlayers.forEach((rp, id) => {
    buildTextureAndSprite(scene, id, rp.skin, rp.targetX, rp.targetY, (sprite) => {
      rp.sprite = sprite;
      rp.nameText = scene.add.text(sprite.x, sprite.y - 26, rp.name, textStyle()).setOrigin(0.5);
    });
  });

  // Input
  cursors = scene.input.keyboard.createCursorKeys();
  keysWASD = scene.input.keyboard.addKeys({ up: "W", down: "S", left: "A", right: "D" });
  spaceKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

  scene._elapsedSinceSend = 0;
}

function textStyle() {
  return { fontFamily: "VT323, monospace", fontSize: "16px", color: "#eaf6f6", stroke: "#082436", strokeThickness: 3 };
}

function drawFishingSpots(scene) {
  scene.spotGraphics.clear();
  scene.spotGraphics.lineStyle(2, 0x5fe0c7, 0.8);
  FISHING_SPOTS.forEach((s) => {
    scene.spotGraphics.strokeCircle(s.x, s.y, 14);
  });
}

// Membuat texture Phaser 32x32 dari dataURL skin 16x16 (nearest-neighbor scale),
// lalu membuat sprite. Kalau skin null, pakai kotak warna default sebagai placeholder.
function buildTextureAndSprite(scene, key, skinDataURL, x, y, onReady) {
  const texKey = "skin_" + key;
  if (!skinDataURL) {
    const fallback = scene.add.rectangle(x, y, 24, 24, 0x5fe0c7).setStrokeStyle(2, 0x082436);
    onReady(fallback);
    return;
  }
  if (scene.textures.exists(texKey)) scene.textures.remove(texKey);
  scene.textures.once(Phaser.Textures.Events.ADD, (addedKey) => {
    if (addedKey !== texKey) return;
    const sprite = scene.add.image(x, y, texKey);
    sprite.setScale(24 / 16); // 16px art -> ~24px on screen
    onReady(sprite);
  });
  scene.textures.addBase64(texKey, skinDataURL);
}

function applySkinToRemote(id, skinDataURL) {
  const rp = remotePlayers.get(id);
  if (!rp || !game || !game.scene.scenes[0]) return;
  const scene = game.scene.scenes[0];
  const x = rp.sprite ? rp.sprite.x : rp.targetX;
  const y = rp.sprite ? rp.sprite.y : rp.targetY;
  if (rp.sprite) rp.sprite.destroy();
  buildTextureAndSprite(scene, id, skinDataURL, x, y, (sprite) => { rp.sprite = sprite; });
  rp.skin = skinDataURL;
}

function addRemotePlayer(p) {
  remotePlayers.set(p.id, {
    sprite: null,
    nameText: null,
    targetX: p.x,
    targetY: p.y,
    facing: p.facing || "down",
    name: p.name,
    skin: p.skin
  });
  scoreState.set(p.id, { name: p.name, score: p.score || 0 });

  if (game && game.scene.scenes[0]) {
    const scene = game.scene.scenes[0];
    buildTextureAndSprite(scene, p.id, p.skin, p.x, p.y, (sprite) => {
      const rp = remotePlayers.get(p.id);
      if (!rp) return;
      rp.sprite = sprite;
      rp.nameText = scene.add.text(sprite.x, sprite.y - 26, p.name, textStyle()).setOrigin(0.5);
    });
  }
}

function update(time, delta) {
  if (!localSprite) return;
  const scene = this;

  // --- Gerak pemain lokal ---
  let vx = 0, vy = 0;
  if (cursors.left.isDown || keysWASD.left.isDown) vx = -1;
  else if (cursors.right.isDown || keysWASD.right.isDown) vx = 1;
  if (cursors.up.isDown || keysWASD.up.isDown) vy = -1;
  else if (cursors.down.isDown || keysWASD.down.isDown) vy = 1;

  if (vx !== 0 || vy !== 0) {
    const len = Math.hypot(vx, vy) || 1;
    const dt = delta / 1000;
    localSprite.x = Phaser.Math.Clamp(localSprite.x + (vx / len) * MOVE_SPEED * dt, 12, GAME_W - 12);
    localSprite.y = Phaser.Math.Clamp(localSprite.y + (vy / len) * MOVE_SPEED * dt, 12, GAME_H - 12);
  }
  if (localNameText) {
    localNameText.x = localSprite.x;
    localNameText.y = localSprite.y - 26;
  }

  // Kirim posisi ke server (throttled)
  scene._elapsedSinceSend += delta;
  if (scene._elapsedSinceSend >= SEND_INTERVAL_MS) {
    scene._elapsedSinceSend = 0;
    if (socket) socket.emit("move", { x: localSprite.x, y: localSprite.y, facing: "down" });
  }

  // --- Interpolasi pemain lain ---
  remotePlayers.forEach((rp) => {
    if (!rp.sprite) return;
    rp.sprite.x = Phaser.Math.Linear(rp.sprite.x, rp.targetX, 0.25);
    rp.sprite.y = Phaser.Math.Linear(rp.sprite.y, rp.targetY, 0.25);
    if (rp.nameText) {
      rp.nameText.x = rp.sprite.x;
      rp.nameText.y = rp.sprite.y - 26;
    }
  });

  // --- Mancing ---
  if (Phaser.Input.Keyboard.JustDown(spaceKey) && !isFishing) {
    const nearSpot = FISHING_SPOTS.find(
      (s) => Phaser.Math.Distance.Between(localSprite.x, localSprite.y, s.x, s.y) < FISH_CATCH_RADIUS
    );
    if (nearSpot) startFishing(scene, nearSpot);
    else showToast("Deketin titik mancing dulu (lingkaran hijau) ✨");
  }
}

// ---------------------------------------------------------------
// Mini-game mancing: tunggu gigitan -> quick-time-event tekan SPASI
// ---------------------------------------------------------------
function startFishing(scene, spot) {
  isFishing = true;
  const waitMs = Phaser.Math.Between(900, 2400);

  const waitText = scene.add.text(spot.x, spot.y - 30, "menunggu...", textStyle()).setOrigin(0.5);

  scene.time.delayedCall(waitMs, () => {
    waitText.destroy();
    if (!isFishing) return; // batal kalau sudah selesai/timeout lain
    runQTE(scene, spot);
  });
}

function runQTE(scene, spot) {
  const windowMs = 550;
  const bg = scene.add.rectangle(spot.x, spot.y - 34, 60, 10, 0x082436).setOrigin(0.5);
  const bar = scene.add.rectangle(spot.x - 30, spot.y - 34, 60, 10, 0xffe66b).setOrigin(0, 0.5);
  const label = scene.add.text(spot.x, spot.y - 48, "TEKAN SPASI!", { ...textStyle(), color: "#ffe66b" }).setOrigin(0.5);

  let caught = false;
  const startTime = scene.time.now;

  const catchHandler = () => {
    if (caught) return;
    caught = true;
    finishFishing(scene, spot, true, bg, bar, label);
  };
  scene.input.keyboard.once("keydown-SPACE", catchHandler);

  scene.time.delayedCall(windowMs, () => {
    if (!caught) {
      scene.input.keyboard.off("keydown-SPACE", catchHandler);
      finishFishing(scene, spot, false, bg, bar, label);
    }
  });

  // shrink bar tiap frame lewat update event scene
  const shrinkEvent = scene.time.addEvent({
    delay: 16,
    loop: true,
    callback: () => {
      const t = (scene.time.now - startTime) / windowMs;
      bar.width = Math.max(0, 60 * (1 - t));
      if (t >= 1) shrinkEvent.remove(false);
    }
  });
}

function finishFishing(scene, spot, success, bg, bar, label) {
  bg.destroy(); bar.destroy(); label.destroy();
  isFishing = false;

  if (!success) {
    showToast("Yah, ikannya kabur~");
    return;
  }
  const fish = weightedRandomFish();
  showToast(`Dapat ${fish.name}!`);
  if (socket) socket.emit("catchFish", { points: fish.points, fishName: fish.name });

  // efek splash kecil
  const splash = scene.add.circle(spot.x, spot.y, 4, fish.color, 0.9);
  scene.tweens.add({ targets: splash, radius: 20, alpha: 0, duration: 400, onComplete: () => splash.destroy() });
}

function weightedRandomFish() {
  const total = FISH_TABLE.reduce((s, f) => s + f.weight, 0);
  let r = Math.random() * total;
  for (const f of FISH_TABLE) {
    if (r < f.weight) return f;
    r -= f.weight;
  }
  return FISH_TABLE[0];
}

// ---------------------------------------------------------------
// UI helpers: leaderboard, chat, toast
// ---------------------------------------------------------------
function refreshLeaderboard() {
  if (selfId && !scoreState.has(selfId)) scoreState.set(selfId, { name: myName, score: 0 });
  const list = Array.from(scoreState.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.score - a.score);

  const el = document.getElementById("leaderboard");
  el.innerHTML = "";
  list.forEach((p) => {
    const li = document.createElement("li");
    const label = p.id === selfId ? `${p.name} (kamu)` : p.name;
    li.innerHTML = `<span>${escapeHtml(label)}</span><span>${p.score}</span>`;
    el.appendChild(li);
  });
}

function appendChat(name, text, isSelf) {
  const el = document.getElementById("chatLog");
  const li = document.createElement("li");
  li.innerHTML = `<span class="who">${escapeHtml(isSelf ? "Kamu" : name)}:</span> ${escapeHtml(text)}`;
  el.appendChild(li);
  el.scrollTop = el.scrollHeight;
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2200);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
