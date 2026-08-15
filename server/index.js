// Auto-detect lokasi folder client di berbagai kemungkinan struktur folder Railway
const candidates = [
  path.join(__dirname, "..", "client"),
  path.join(__dirname, "..", "fishing-game", "client"),
  path.join(process.cwd(), "client"),
  path.join(process.cwd(), "fishing-game", "client"),
  path.join(__dirname, "client")
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
