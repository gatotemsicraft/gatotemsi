// ===== Mancing Mabar: Skin Editor (16x16 pixel canvas) =====
// Menyimpan grid warna di memori, render ke DOM grid + preview canvas,
// dan mengekspor jadi dataURL PNG 16x16 yang dikirim ke server/pemain lain.

const SkinEditor = (() => {
  const SIZE = 16;
  const PALETTE = [
    "#000000", "#ffffff", "#7f7f7f", "#c2c2c2",
    "#7f2b2b", "#ff6b6b", "#ffb56b", "#ffe66b",
    "#8fd694", "#2fa84f", "#5fe0c7", "#4fa3ff",
    "#2b3a8f", "#8f5fd6", "#d65fb0", "#d8a15b"
  ];

  let grid = []; // grid[y][x] = "#rrggbb" | null (transparan)
  let selectedColor = PALETTE[5];
  let eraserOn = false;
  let saveCallback = null;

  const gridEl = () => document.getElementById("pixelGrid");
  const previewEl = () => document.getElementById("editorPreview");
  const lobbyPreviewEl = () => document.getElementById("skinPreviewCanvas");

  function defaultGrid() {
    // Karakter nelayan kecil sederhana sebagai default, biar gak kosong.
    const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    const skin = "#ffb56b", shirt = "#4fa3ff", hat = "#d8a15b", dark = "#2b2b2b";
    for (let y = 3; y < 6; y++) for (let x = 5; x < 11; x++) g[y][x] = hat;      // topi
    for (let y = 6; y < 9; y++) for (let x = 5; x < 11; x++) g[y][x] = skin;     // wajah
    g[7][6] = dark; g[7][9] = dark; // mata
    for (let y = 9; y < 13; y++) for (let x = 4; x < 12; x++) g[y][x] = shirt;   // baju
    for (let y = 13; y < 15; y++) { g[y][6] = dark; g[y][9] = dark; }            // kaki
    return g;
  }

  function init() {
    grid = defaultGrid();
    buildGridDOM();
    buildPalette();
    renderPreview();
    renderLobbyPreview();

    document.getElementById("eraserBtn").addEventListener("click", () => {
      eraserOn = !eraserOn;
      document.getElementById("eraserBtn").style.outline = eraserOn ? "2px solid var(--aqua)" : "none";
    });
    document.getElementById("clearAllBtn").addEventListener("click", () => {
      grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
      buildGridDOM();
      renderPreview();
    });
    document.getElementById("customColor").addEventListener("input", (e) => {
      selectedColor = e.target.value;
      eraserOn = false;
      document.getElementById("eraserBtn").style.outline = "none";
      highlightSwatch(null);
    });
    document.getElementById("closeEditorBtn").addEventListener("click", close);
    document.getElementById("saveSkinBtn").addEventListener("click", () => {
      renderLobbyPreview();
      if (saveCallback) saveCallback(getDataURL());
      close();
    });
    document.getElementById("editSkinBtn").addEventListener("click", open);
    const openInGame = document.getElementById("openEditorInGame");
    if (openInGame) openInGame.addEventListener("click", open);
  }

  function buildGridDOM() {
    const el = gridEl();
    el.innerHTML = "";
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const cell = document.createElement("div");
        cell.className = "pixel-cell";
        cell.style.background = grid[y][x] || "transparent";
        cell.dataset.x = x;
        cell.dataset.y = y;
        cell.addEventListener("mousedown", () => paint(x, y));
        cell.addEventListener("mouseenter", (e) => { if (e.buttons === 1) paint(x, y); });
        el.appendChild(cell);
      }
    }
  }

  function paint(x, y) {
    grid[y][x] = eraserOn ? null : selectedColor;
    const cell = gridEl().querySelector(`[data-x="${x}"][data-y="${y}"]`);
    if (cell) cell.style.background = grid[y][x] || "transparent";
    renderPreview();
  }

  function buildPalette() {
    const el = document.getElementById("palette");
    el.innerHTML = "";
    PALETTE.forEach((color) => {
      const sw = document.createElement("div");
      sw.className = "swatch";
      sw.style.background = color;
      if (color === selectedColor) sw.classList.add("selected");
      sw.addEventListener("click", () => {
        selectedColor = color;
        eraserOn = false;
        document.getElementById("eraserBtn").style.outline = "none";
        highlightSwatch(sw);
      });
      el.appendChild(sw);
    });
  }

  function highlightSwatch(target) {
    document.querySelectorAll("#palette .swatch").forEach((s) => s.classList.remove("selected"));
    if (target) target.classList.add("selected");
  }

  function drawToCanvas(canvas) {
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = canvas.width / SIZE;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (grid[y][x]) {
          ctx.fillStyle = grid[y][x];
          ctx.fillRect(x * scale, y * scale, scale, scale);
        }
      }
    }
  }

  function renderPreview() { drawToCanvas(previewEl()); }
  function renderLobbyPreview() { drawToCanvas(lobbyPreviewEl()); }

  function getDataURL() {
    // Ekspor sebagai PNG 16x16 asli (bukan yang di-scale) supaya file kecil.
    const tiny = document.createElement("canvas");
    tiny.width = SIZE;
    tiny.height = SIZE;
    const ctx = tiny.getContext("2d");
    ctx.clearRect(0, 0, SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (grid[y][x]) {
          ctx.fillStyle = grid[y][x];
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    return tiny.toDataURL("image/png");
  }

  function open() { document.getElementById("skinEditorModal").classList.remove("hidden"); }
  function close() { document.getElementById("skinEditorModal").classList.add("hidden"); }
  function onSave(cb) { saveCallback = cb; }

  return { init, open, close, getDataURL, onSave };
})();

document.addEventListener("DOMContentLoaded", SkinEditor.init);
