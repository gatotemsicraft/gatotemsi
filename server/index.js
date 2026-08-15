// Mancing Mabar - Server Auto Path Fix
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

// Daftar jalur pencarian folder client di container Railway
const candidates = [
  path.join(__dirname, "..", "client"),
  path.join(__dirname, "client"),
  path.join(process.cwd(), "fishing-game", "client"),
  path.join(process.cwd(), "client"),
  "/app/fishing-game/client",
  "/app/client"
];

let clientPath = candidates.find(p => fs.existsSync(path.join(p, "index.html"))) || candidates[0];

app.use(express.static(clientPath));

app.get("*", (req, res) => {
  const indexPath = path.join(clientPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    // Kalau masih gagal, tampilkan lokasi persis tempat file berada
    res.status(404).send(`Path client tidak ditemukan. Server membaca: ${clientPath}`);
  }
});

// Socket.io Multiplayer Wiring
const rooms = new Map();

function getRoom(roomName) {
  if (!rooms.has(roomName)) rooms.set(roomName, new Map());
  return rooms.get(roomName);
}

io.on("connection", (socket) => {
  let currentRoom = null;

  socket.on("join", ({ name, room }) => {
    currentRoom = (typeof room === "string" && room.trim()) ? room.trim().slice(0, 32) : "dermaga-utama";
    socket.join(currentRoom);

    const players = getRoom(currentRoom);
    const player = {
      id: socket.id,
      name: (name || "Nelayan").slice(0, 16),
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
    player.x = x;
    player.y = y;
    player.facing = facing || player.facing;
    socket.to(currentRoom).emit("playerMoved", { id: socket.id, x, y, facing: player.facing });
  });

  socket.on("catchFish", ({ points, fishName }) => {
    if (!currentRoom) return;
    const players = getRoom(currentRoom);
    const player = players.get(socket.id);
    if (!player) return;
    player.score += (points || 1);
    io.in(currentRoom).emit("scoreUpdated", { id: socket.id, score: player.score, fishName: fishName || "Ikan" });
  });

  socket.on("chat", (text) => {
    if (!currentRoom || !text) return;
    const players = getRoom(currentRoom);
    const player = players.get(socket.id);
    io.in(currentRoom).emit("chatMessage", { id: socket.id, name: player ? player.name : "?", text: text.slice(0, 140) });
  });

  socket.on("disconnect", () => {
    if (!currentRoom) return;
    const players = getRoom(currentRoom);
    players.delete(socket.id);
    socket.to(currentRoom).emit("playerLeft", { id: socket.id });
    if (players.size === 0) rooms.delete(currentRoom);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server jalan di port ${PORT}`);
});
