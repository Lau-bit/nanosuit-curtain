// Nanosuit Curtain - options page logic + live preview.
const DEFAULTS = {
  mode: "pattern",
  imageData: "",
  imageFit: "cover",
  opacity: 1,
  carbonColor: "#0b0c0f",
  glowColor: "#ff7a16",
  glowIntensity: 0.6,
  hexSize: 46,
  animate: true,
  showHint: true,
  hotkeyEnabled: false,
  hotkey: null,
  keyboardThrough: false,
  mediaHud: true
};

let state = { ...DEFAULTS };
const $ = (id) => document.getElementById(id);

// ---- hotkey label (mirrors content.js) -------------------------------------
function keyName(code) {
  if (!code) return "";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Num " + code.slice(6);
  if (code === "Space") return "Space";
  return code;
}
function hotkeyLabel(hk) {
  if (!hk || !hk.code) return "";
  const parts = [];
  if (hk.ctrl) parts.push("Ctrl");
  if (hk.alt) parts.push("Alt");
  if (hk.shift) parts.push("Shift");
  if (hk.meta) parts.push("Meta");
  parts.push(keyName(hk.code));
  return parts.join("+");
}
const MODIFIER_CODES = ["ControlLeft", "ControlRight", "AltLeft", "AltRight",
  "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight"];

// ---- hex preview (mirrors content.js drawHexField, scaled to the canvas) ----
function hexPath(ctx, cx, cy, s) {
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    const x = cx + s * Math.cos(a), y = cy + s * Math.sin(a);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function drawPreview() {
  const cv = $("preview");
  const rect = cv.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.max(200, rect.width), H = Math.max(200, rect.height);
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (state.mode === "image" && state.imageData) {
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      const fit = state.imageFit;
      if (fit === "tile") {
        const p = ctx.createPattern(img, "repeat");
        ctx.fillStyle = p; ctx.fillRect(0, 0, W, H);
      } else if (fit === "center") {
        ctx.drawImage(img, (W - img.width) / 2, (H - img.height) / 2);
      } else {
        const scale = fit === "contain"
          ? Math.min(W / img.width, H / img.height)
          : Math.max(W / img.width, H / img.height);
        const dw = img.width * scale, dh = img.height * scale;
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      }
      ctx.globalAlpha = 1;
    };
    img.src = state.imageData;
    return;
  }

  const s = Math.max(14, state.hexSize * 0.7);
  const seam = Math.max(1.5, s * 0.06);
  const glow = state.glowColor, carbon = state.carbonColor;
  const gi = state.glowIntensity;

  ctx.fillStyle = shade(carbon, -0.03); ctx.fillRect(0, 0, W, H);
  const horiz = 1.5 * s, vert = Math.sqrt(3) * s;
  const cols = Math.ceil(W / horiz) + 2, rows = Math.ceil(H / vert) + 2;

  ctx.lineJoin = "round";
  for (let c = -1; c < cols; c++) {
    const offY = (c & 1) ? vert / 2 : 0;
    for (let r = -1; r < rows; r++) {
      const cx = c * horiz, cy = r * vert + offY;
      const rnd = Math.random();
      const bright = rnd > 0.93 ? 1 : rnd > 0.7 ? 0.55 : 0.28;
      ctx.beginPath(); hexPath(ctx, cx, cy, s);
      ctx.strokeStyle = glow; ctx.globalAlpha = Math.min(1, gi * bright + 0.05);
      ctx.lineWidth = seam; ctx.shadowColor = glow; ctx.shadowBlur = (8 + bright * 16) * gi;
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;

  for (let c = -1; c < cols; c++) {
    const offY = (c & 1) ? vert / 2 : 0;
    for (let r = -1; r < rows; r++) {
      const cx = c * horiz, cy = r * vert + offY;
      if (Math.random() < 0.05) continue;
      const v = (Math.random() - 0.5) * 0.05;
      const g = ctx.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
      g.addColorStop(0, shade(carbon, 0.04 + v));
      g.addColorStop(0.5, shade(carbon, v));
      g.addColorStop(1, shade(carbon, -0.05 + v));
      ctx.beginPath(); hexPath(ctx, cx, cy, s - seam); ctx.fillStyle = g; ctx.fill();
      ctx.save(); ctx.beginPath(); hexPath(ctx, cx, cy, s - seam); ctx.clip();
      ctx.globalAlpha = 0.06; ctx.strokeStyle = shade(carbon, 0.12); ctx.lineWidth = 1;
      for (let k = -s; k < s; k += 5) { ctx.beginPath(); ctx.moveTo(cx + k, cy - s); ctx.lineTo(cx + k + s, cy + s); ctx.stroke(); }
      ctx.restore(); ctx.globalAlpha = 1;
    }
  }
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  cv.style.opacity = state.opacity;
}

// ---- form binding -----------------------------------------------------------
function applyToForm() {
  $("carbonColor").value = state.carbonColor;
  $("glowColor").value = state.glowColor;
  $("glowIntensity").value = state.glowIntensity;
  $("glowIntensityV").textContent = (+state.glowIntensity).toFixed(2);
  $("hexSize").value = state.hexSize;
  $("hexSizeV").textContent = state.hexSize + "px";
  $("opacity").value = state.opacity;
  $("opacityV").textContent = (+state.opacity).toFixed(2);
  $("animate").checked = !!state.animate;
  $("showHint").checked = !!state.showHint;
  $("keyboardThrough").checked = !!state.keyboardThrough;
  $("mediaHud").checked = !!state.mediaHud;
  $("mediaHud").disabled = !state.keyboardThrough;
  $("hotkeyEnabled").checked = !!state.hotkeyEnabled;
  const hkBtn = $("hotkeyBtn");
  if (!hkBtn.classList.contains("capturing"))
    hkBtn.textContent = hotkeyLabel(state.hotkey) || "Click, then press keys…";
  $("imageFit").value = state.imageFit;
  document.querySelectorAll("#modeSeg button").forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === state.mode));
  $("imageOpts").hidden = state.mode !== "image";
  $("patternOpts").style.display = state.mode === "image" ? "none" : "";
  const thumb = $("thumb");
  if (state.imageData) { thumb.src = state.imageData; thumb.style.display = "block"; }
  else thumb.style.display = "none";
}

function bind() {
  document.querySelectorAll("#modeSeg button").forEach((b) =>
    b.addEventListener("click", () => { state.mode = b.dataset.mode; applyToForm(); drawPreview(); saveDebounced(); }));

  const live = {
    carbonColor: "carbonColor", glowColor: "glowColor",
    glowIntensity: "glowIntensity", hexSize: "hexSize", opacity: "opacity",
    imageFit: "imageFit"
  };
  Object.entries(live).forEach(([key, id]) => {
    $(id).addEventListener("input", () => {
      let v = $(id).value;
      if (["glowIntensity", "hexSize", "opacity"].includes(key)) v = +v;
      state[key] = v;
      if (key === "glowIntensity") $("glowIntensityV").textContent = v.toFixed(2);
      if (key === "hexSize") $("hexSizeV").textContent = v + "px";
      if (key === "opacity") $("opacityV").textContent = v.toFixed(2);
      drawPreview(); saveDebounced();
    });
  });
  $("animate").addEventListener("change", () => { state.animate = $("animate").checked; saveDebounced(); });
  $("showHint").addEventListener("change", () => { state.showHint = $("showHint").checked; saveDebounced(); });
  $("keyboardThrough").addEventListener("change", () => { state.keyboardThrough = $("keyboardThrough").checked; applyToForm(); saveDebounced(); });
  $("mediaHud").addEventListener("change", () => { state.mediaHud = $("mediaHud").checked; saveDebounced(); });

  // hotkey capture
  $("hotkeyEnabled").addEventListener("change", () => { state.hotkeyEnabled = $("hotkeyEnabled").checked; saveDebounced(); });
  const hkBtn = $("hotkeyBtn");
  hkBtn.addEventListener("focus", () => { hkBtn.classList.add("capturing"); hkBtn.textContent = "Press keys…"; });
  hkBtn.addEventListener("blur", () => { hkBtn.classList.remove("capturing"); applyToForm(); });
  hkBtn.addEventListener("keydown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.code === "Escape") { hkBtn.blur(); return; }
    if (MODIFIER_CODES.includes(e.code)) return; // wait for a non-modifier key
    state.hotkey = { code: e.code, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
    state.hotkeyEnabled = true;
    hkBtn.blur();      // triggers applyToForm() to show the new label
    saveDebounced();
  });
  $("hotkeyClear").addEventListener("click", () => { state.hotkey = null; applyToForm(); saveDebounced(); });

  // image input: paste + file
  const setImage = (dataUrl) => {
    state.imageData = dataUrl;
    state.mode = "image";
    applyToForm(); drawPreview(); saveDebounced();
  };
  const readFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const fr = new FileReader();
    fr.onload = () => setImage(fr.result);
    fr.readAsDataURL(file);
  };
  $("fileInput").addEventListener("change", (e) => readFile(e.target.files[0]));
  const pasteHandler = (e) => {
    const items = (e.clipboardData || window.clipboardData).items;
    for (const it of items) {
      if (it.type.startsWith("image/")) { readFile(it.getAsFile()); e.preventDefault(); return; }
    }
  };
  $("pasteBox").addEventListener("paste", pasteHandler);
  document.addEventListener("paste", pasteHandler); // catch paste anywhere on the page

  $("reset").addEventListener("click", () => {
    if (!confirm("Reset all Nanosuit Curtain settings to their defaults?\nA custom image, if set, will be removed.")) return;
    state = { ...DEFAULTS };
    applyToForm(); drawPreview(); save();
  });
}

let saveTimer = 0;
function saveDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 250);
}

function save() {
  clearTimeout(saveTimer);
  chrome.storage.sync.set(state, () => {
    const el = $("saved");
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 1200);
  });
}

chrome.storage.sync.get(DEFAULTS, (got) => {
  state = { ...DEFAULTS, ...(got || {}) };
  applyToForm();
  bind();
  drawPreview();
});
window.addEventListener("resize", drawPreview);
