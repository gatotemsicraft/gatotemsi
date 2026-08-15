// Mancing Mabar - Server
const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 8080;

// Auto-detect lokasi folder client di Railway
const candidates = [
  path.join(__dirname, "..", "client"),
  path.join(__dirname, "client"),
  path.join(process.cwd(), "client"),
  path.join(process.cwd(), "..", "client"),
  path.join(process.cwd(), "fishing-game", "client")
];

let clientPath = candidates.find(p => fs.existsSync(path.join(p, "index.html"))) || candidates[0];

// Melayani file statis dari folder client yang ditemukan
app.use(express.static(clientPath));

// Route wildcard agar '/' selalu membuka index.html
app.get("*", (req, res) => {
  const indexPath = path.join(clientPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send(`Server jalan di port ${PORT}, tapi index.html tidak ditemukan. Path dicoba: ${clientPath}`);
  }
});

// State room di memory
const rooms = new Map();
const MAX_SKIN_LENGTH = 20000;
const MAX_NAME_LENGTH = 16;

function getRoom(roomName) {
  if (!rooms.has(roomName)) rooms.set(roomName, new Map());
  return rooms.get(roomName);
}

function sanitizeName(name) {
  if (typeof name !== "string") return "Nelayan";
  const clean = name.replace(/[^\w \-]/g, "").trim();
  return (clean || "Nelayan").slice(0, MAX_NAME_LENGTH);
}

io.on("connection", (socket) => {
  let currentRoom = null;

  socket.on("join", ({ name, room }) => {
    currentRoom = (typeof room === "string" && room.trim()) ? room.trim().slice(0, 32) : "dermaga-utama";
    socket.join(currentRoom);

    const players = getRoom(currentRoom);
    const player = {
      id: socket.id,
      name: sanitizeName(name),
      x: 400 + Math.floor(Math.random() * 100),
      y: 300 + Math.floor(Math.random() * 60),
      facing: "down",
      skin: null,
      score: 0
    };
    players.set(socket.id, player);

    socket.emit("init", {
      selfId: socket.id,
      room: currentRoom,
      players: Array.from(players.values())
    });

    socket.to(currentRoom).emit("playerJoined", player);
  });

  socket.on("move", ({ x, y, facing }) => {
    if (!currentRoom) return;
    const players = getRoom(currentRoom);
    const player = players.get(socket.id);
    if (!player) return;
    if (typeof x !== "number" || typeof y !== "number") return;
    player.x = x;
    player.y = y;
    player.facing = typeof facing === "string" ? facing : player.facing;
    socket.to(currentRoom).emit("playerMoved", { id: socket.id, x, y, facing: player.facing });
  });

  socket.on("updateSkin", (skinDataUrl) => {
    if (!currentRoom) return;
    if (typeof skinDataUrl !== "string" || skinDataUrl.length > MAX_SKIN_LENGTH) return;
    if (!skinDataUrl.startsWith("data:image/png;base64,")) return;
    const players = getRoom(currentRoom);
    const player = players.get(socket.id);
    if (!player) return;
    player.skin = skinDataUrl;
    io.in(currentRoom).emit("skinUpdated", { id: socket.id, skin: skinDataUrl });
  });

  socket.on("catchFish", ({ points, fishName }) => {
    if (!currentRoom) return;
    const players = getRoom(currentRoom);
    const player = players.get(socket.id);
    if (!player) return;
    const addPoints = Number.isFinite(points) ? Math.max(0, Math.min(100, points)) : 1;
    player.score += addPoints;
    io.in(currentRoom).emit("scoreUpdated", { id: socket.id, score: player.score, fishName: fishName || "Ikan" });
  });

  socket.on("chat", (text) => {
    if (!currentRoom || typeof text !== "string") return;
    const clean = text.slice(0, 140);
    if (!clean.trim()) return;
    const players = getRoom(currentRoom);
    const player = players.get(socket.id);
    io.in(currentRoom).emit("chatMessage", { id: socket.id, name: player ? player.name : "?", text: clean });
  });

  socket.on("disconnect", () => {
    if (!currentRoom) return;
    const players = getRoom(currentRoom);
    players.delete(socket.id);
    socket.to(currentRoom).emit("playerLeft", { id: socket.id });
    if (players.size === 0) rooms.delete(currentRoom);
  });
});

server.listen(PORT, () => {
  console.log(`Mancing Mabar server jalan di port ${PORT}`);
});
