// Nanosuit Curtain - content script
// Builds a full-viewport, non-click-through "curtain" over the page. The
// curtain is either a user image or a procedurally drawn Crysis-style nanosuit
// hexagon field (carbon panels with glowing orange energy seams, with random
// panel variations and the occasional broken/missing panel).
//
// Guard against double-injection: background.js may executeScript() this file
// on top of the manifest-declared one.
(() => {
  if (window.__nanosuitCurtainLoaded) return;
  window.__nanosuitCurtainLoaded = true;

  const CURTAIN_ID = "__nanosuit-curtain";
  const Z = 2147483647;

  const DEFAULTS = {
    mode: "pattern",       // "pattern" | "image"
    imageData: "",         // data URL
    imageFit: "cover",     // cover | contain | tile | center
    opacity: 1,            // 0.5 .. 1
    carbonColor: "#0b0c0f",
    glowColor: "#ff7a16",
    glowIntensity: 0.6,    // 0 .. 1
    hexSize: 46,           // px, center-to-corner
    animate: true,
    showHint: true,
    hotkeyEnabled: false,  // user-defined in-page toggle hotkey (separate from
    hotkey: null,          // the browser command). { code, ctrl, alt, shift, meta }
    keyboardThrough: false,// let the keyboard operate the page while the curtain
                           // is up (mouse stays blocked); default off
    mediaHud: true         // show a speed/volume/play HUD over the curtain when
                           // media state changes (only with keyboardThrough)
  };

  let settings = { ...DEFAULTS };
  let resizeRAF = 0;
  let active = false; // whether the curtain is currently up

  // Event interceptors are registered ONCE, at document_start, so they sit ahead
  // of the page's own capture-phase handlers (e.g. YouTube's yt-hotkey-manager,
  // which otherwise grabs space/k/arrows and click-to-pause before us). They only
  // do anything while the curtain is `active`.
  function interceptPointer(e) {
    if (!active) return;
    if (e.type === "contextmenu") {
      // Keep the page from seeing it, but let the browser's native menu open so
      // the "Toggle Nanosuit Curtain" item is reachable. (No preventDefault.)
      e.stopPropagation();
      return;
    }
    e.stopImmediatePropagation();
    e.preventDefault();
  }
  function interceptKey(e) {
    if (!active) return;
    // Opt-in pass-through: let the keyboard operate the page through the curtain
    // (e.g. YouTube space/k, extension playback hotkeys) while the mouse stays
    // blocked. The custom toggle hotkey above still fires either way.
    if (settings.keyboardThrough) return;
    // Let browser accelerators through (Ctrl/Cmd combos): Ctrl+R to refresh,
    // Ctrl+W to close, etc. Refreshing reloads the page and clears the curtain.
    if (e.ctrlKey || e.metaKey) return;
    // Block plain page shortcuts (space/k/arrows/letters) from the hidden page.
    e.stopImmediatePropagation();
    e.preventDefault();
  }
  // User-defined toggle hotkey. Registered ahead of interceptKey (capture phase,
  // earlier registration) so it fires first and works whether the curtain is up
  // or down, beating both the page's handlers and our own key-blocker.
  function matchesHotkey(e) {
    const hk = settings.hotkey;
    if (!settings.hotkeyEnabled || !hk || !hk.code) return false;
    if (e.code !== hk.code) return false;
    return !!hk.ctrl === e.ctrlKey && !!hk.alt === e.altKey &&
      !!hk.shift === e.shiftKey && !!hk.meta === e.metaKey;
  }
  function onHotkey(e) {
    if (!matchesHotkey(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    toggle();
  }
  window.addEventListener("keydown", onHotkey, true);

  const POINTER_EVENTS = ["click", "auxclick", "dblclick", "mousedown", "mouseup",
    "pointerdown", "pointerup", "wheel", "contextmenu", "touchstart", "touchend"];
  const KEY_EVENTS = ["keydown", "keyup", "keypress"];
  POINTER_EVENTS.forEach((ev) => window.addEventListener(ev, interceptPointer, true));
  KEY_EVENTS.forEach((ev) => window.addEventListener(ev, interceptKey, true));

  // Media-state HUD. We can't surface another extension's own toast over our
  // top-layer curtain (its overlay isn't in the top layer, so z-index can't beat
  // a popover). Instead we observe the actual result: whatever extension/hotkey
  // changes playback sets it on the <video>/<audio>, which fires these (capture
  // phase reaches non-bubbling media events), and we draw our own toast inside
  // the curtain so it sits above it. Only while the curtain is up AND keyboard
  // pass-through is on (otherwise nothing the user does can change media state).
  let hudTimer = 0;
  function showHud(text) {
    const curtain = document.getElementById(CURTAIN_ID);
    if (!curtain) return;
    let hud = curtain.__hud;
    if (!hud || !hud.isConnected) {
      hud = document.createElement("div");
      hud.style.cssText = [
        "position:absolute", "top:50%", "left:50%", "transform:translate(-50%,-50%)",
        "padding:14px 26px", "border-radius:14px", "z-index:2",
        "background:rgba(10,11,14,0.72)",
        `border:1px solid ${settings.glowColor}`, `color:${settings.glowColor}`,
        "font:700 30px/1 system-ui,Segoe UI,Roboto,sans-serif", "letter-spacing:.04em",
        "white-space:nowrap", "pointer-events:none", "user-select:none",
        `text-shadow:0 0 12px ${settings.glowColor}`,
        `box-shadow:0 0 28px ${settings.glowColor}55`,
        "opacity:0", "transition:opacity .15s ease"
      ].join(";");
      curtain.appendChild(hud);
      curtain.__hud = hud;
    }
    hud.textContent = text;
    // force a reflow so re-triggering the transition restarts the fade
    void hud.offsetWidth;
    hud.style.opacity = "1";
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => { hud.style.opacity = "0"; }, 950);
  }

  function fmtTime(t) {
    t = Math.max(0, Math.floor(t || 0));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const mm = h ? String(m).padStart(2, "0") : String(m);
    return (h ? h + ":" : "") + mm + ":" + String(s).padStart(2, "0");
  }
  function onMedia(e) {
    if (!active || !settings.mediaHud || !settings.keyboardThrough) return;
    const m = e.target;
    if (!m || (m.tagName !== "VIDEO" && m.tagName !== "AUDIO")) return;
    switch (e.type) {
      case "ratechange": showHud((+m.playbackRate.toFixed(2)) + "×"); break;
      case "volumechange":
        showHud(m.muted || m.volume === 0 ? "Muted" : "Volume " + Math.round(m.volume * 100) + "%");
        break;
      case "play": showHud("Playing ▶"); break;
      case "pause": showHud("Paused ⏸"); break;
      case "seeked": showHud("⏱ " + fmtTime(m.currentTime)); break;
    }
  }
  ["ratechange", "volumechange", "play", "pause", "seeked"]
    .forEach((ev) => window.addEventListener(ev, onMedia, true));

  // Human label for a hotkey combo, e.g. {code:"KeyH",alt:true,shift:true} -> "Alt+Shift+H".
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

  function loadSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(DEFAULTS, (got) => {
          settings = { ...DEFAULTS, ...(got || {}) };
          resolve(settings);
        });
      } catch (_) {
        resolve(settings);
      }
    });
  }

  // ---- hexagon field ------------------------------------------------------

  function hexPath(ctx, cx, cy, s) {
    // flat-top hexagon
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i);
      const x = cx + s * Math.cos(a);
      const y = cy + s * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function shade(hex, amt) {
    // amt in [-1,1]; lighten/darken a #rrggbb color
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
    r = f(r); g = f(g); b = f(b);
    return `rgb(${r},${g},${b})`;
  }

  function drawHexField(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = Math.ceil(W * dpr);
    canvas.height = Math.ceil(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const s = Math.max(18, settings.hexSize);
    const seam = Math.max(1.5, s * 0.06);
    const glow = settings.glowColor;
    const carbon = settings.carbonColor;
    const gi = Math.max(0, Math.min(1, settings.glowIntensity));

    // base
    ctx.fillStyle = shade(carbon, -0.03);
    ctx.fillRect(0, 0, W, H);

    const horiz = 1.5 * s;
    const vert = Math.sqrt(3) * s;
    const cols = Math.ceil(W / horiz) + 2;
    const rows = Math.ceil(H / vert) + 2;

    // pass 1: glowing seams (draw every hex outline with bloom)
    ctx.lineJoin = "round";
    for (let c = -1; c < cols; c++) {
      const offY = (c & 1) ? vert / 2 : 0;
      for (let r = -1; r < rows; r++) {
        const cx = c * horiz;
        const cy = r * vert + offY;

        // random "energy" intensity per seam, plus occasional bright accents
        const rnd = Math.random();
        const bright = rnd > 0.93 ? 1 : rnd > 0.7 ? 0.55 : 0.28;
        ctx.beginPath();
        hexPath(ctx, cx, cy, s);
        ctx.strokeStyle = glow;
        ctx.globalAlpha = Math.min(1, gi * bright + 0.05);
        ctx.lineWidth = seam;
        ctx.shadowColor = glow;
        ctx.shadowBlur = (8 + bright * 16) * gi;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // pass 2: carbon panels inset over the glow, leaving glowing seams.
    // Per-panel variation + random breaks (missing panels) reveal the glow.
    for (let c = -1; c < cols; c++) {
      const offY = (c & 1) ? vert / 2 : 0;
      for (let r = -1; r < rows; r++) {
        const cx = c * horiz;
        const cy = r * vert + offY;

        // ~5% of panels are "broken" / missing -> glow pocket shows through
        if (Math.random() < 0.05) continue;

        const v = (Math.random() - 0.5) * 0.05; // brightness jitter
        const g = ctx.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
        g.addColorStop(0, shade(carbon, 0.04 + v));
        g.addColorStop(0.5, shade(carbon, 0.0 + v));
        g.addColorStop(1, shade(carbon, -0.05 + v));

        ctx.beginPath();
        hexPath(ctx, cx, cy, s - seam);
        ctx.fillStyle = g;
        ctx.fill();

        // faint carbon-twill texture: a couple of diagonal hairlines
        ctx.save();
        ctx.beginPath();
        hexPath(ctx, cx, cy, s - seam);
        ctx.clip();
        ctx.globalAlpha = 0.06;
        ctx.strokeStyle = shade(carbon, 0.12);
        ctx.lineWidth = 1;
        for (let k = -s; k < s; k += 5) {
          ctx.beginPath();
          ctx.moveTo(cx + k, cy - s);
          ctx.lineTo(cx + k + s, cy + s);
          ctx.stroke();
        }
        ctx.restore();
        ctx.globalAlpha = 1;

        // subtle inner edge highlight on a few panels for depth
        if (Math.random() > 0.85) {
          ctx.beginPath();
          hexPath(ctx, cx, cy, s - seam * 1.5);
          ctx.strokeStyle = glow;
          ctx.globalAlpha = 0.12 * gi;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }

    // a soft vignette so it reads as a panel, not a flat fill
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  // ---- curtain build ------------------------------------------------------

  function buildCurtain() {
    const curtain = document.createElement("div");
    curtain.id = CURTAIN_ID;
    curtain.tabIndex = -1;
    // Render in the browser top layer (above EVERYTHING, including a page's
    // fullscreen/top-layer video like YouTube's player which a normal z-index
    // can't beat). showPopover() promotes it; we still set z-index as a fallback
    // for older engines without the Popover API.
    curtain.setAttribute("popover", "manual");

    // Apply the load-bearing properties with !important priority so a page's own
    // stylesheet (some sites ship `* { pointer-events: ... } !important` resets)
    // can't override them and leave the curtain click-through. The UA popover
    // stylesheet also sets margin/border/inset, so we must beat it too.
    const important = {
      position: "fixed", inset: "0", top: "0", left: "0", right: "0", bottom: "0",
      width: "100vw", height: "100vh", "max-width": "none", "max-height": "none",
      margin: "0", padding: "0", border: "0",
      "z-index": String(Z), "pointer-events": "auto", overflow: "hidden",
      background: "#000", cursor: "default", "user-select": "none",
      opacity: String(settings.opacity), display: "block", visibility: "visible",
      transform: "none", filter: "none", "clip-path": "none"
    };
    for (const [k, v] of Object.entries(important)) {
      curtain.style.setProperty(k, v, "important");
    }
    // Input is blocked by the global window-level interceptors (see top of file)
    // while `active`; pointer-events:auto here just makes the curtain the hit
    // target so the page beneath gets no hover/cursor feedback either.

    if (settings.mode === "image" && settings.imageData) {
      const layer = document.createElement("div");
      let bg = `center / cover no-repeat`;
      if (settings.imageFit === "contain") bg = "center / contain no-repeat";
      else if (settings.imageFit === "tile") bg = "top left / auto repeat";
      else if (settings.imageFit === "center") bg = "center / auto no-repeat";
      layer.style.cssText = [
        "position:absolute", "inset:0",
        `background:${bg}`,
        `background-image:url('${settings.imageData.replace(/'/g, "%27")}')`,
        "background-color:#000"
      ].join(";");
      curtain.appendChild(layer);
    } else {
      const canvas = document.createElement("canvas");
      canvas.style.cssText = "position:absolute;inset:0;display:block;width:100%;height:100%";
      curtain.appendChild(canvas);
      drawHexField(canvas);
      curtain.__canvas = canvas;

      if (settings.animate) {
        // CSP-safe breathing glow via the Web Animations API.
        try {
          canvas.animate(
            [
              { filter: "brightness(0.92) saturate(0.95)" },
              { filter: "brightness(1.08) saturate(1.12)" },
              { filter: "brightness(0.92) saturate(0.95)" }
            ],
            { duration: 5200, iterations: Infinity, easing: "ease-in-out" }
          );
          // slow moving energy glint
          const sweep = document.createElement("div");
          sweep.style.cssText = [
            "position:absolute", "inset:-30%",
            `background:radial-gradient(circle at 30% 30%, ${settings.glowColor}22, transparent 45%)`,
            "mix-blend-mode:screen", "pointer-events:none"
          ].join(";");
          curtain.appendChild(sweep);
          sweep.animate(
            [
              { transform: "translate(-12%,-8%)" },
              { transform: "translate(12%,10%)" },
              { transform: "translate(-12%,-8%)" }
            ],
            { duration: 14000, iterations: Infinity, easing: "ease-in-out" }
          );
        } catch (_) { /* WAA unavailable - static is fine */ }
      }
    }

    if (settings.showHint) {
      const hint = document.createElement("div");
      const dismiss = (settings.hotkeyEnabled && settings.hotkey && settings.hotkey.code)
        ? hotkeyLabel(settings.hotkey)
        : "Alt+Shift+H";
      hint.textContent = "Nanosuit Curtain  ·  " + dismiss + " to dismiss";
      hint.style.cssText = [
        "position:absolute", "left:50%", "bottom:26px", "transform:translateX(-50%)",
        "font:600 12px/1 system-ui,Segoe UI,Roboto,sans-serif",
        `color:${settings.glowColor}`, "letter-spacing:.12em", "text-transform:uppercase",
        `text-shadow:0 0 8px ${settings.glowColor}`, "opacity:.0", "pointer-events:none"
      ].join(";");
      curtain.appendChild(hint);
      try {
        hint.animate(
          [{ opacity: 0 }, { opacity: 0.85, offset: 0.15 }, { opacity: 0.85, offset: 0.7 }, { opacity: 0 }],
          { duration: 4200, easing: "ease-in-out", fill: "forwards" }
        );
      } catch (_) { hint.style.opacity = "0"; }
    }

    return curtain;
  }

  function onResize() {
    const curtain = document.getElementById(CURTAIN_ID);
    if (!curtain || !curtain.__canvas) return;
    cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(() => drawHexField(curtain.__canvas));
  }

  function show() {
    if (document.getElementById(CURTAIN_ID)) return;
    active = true; // arms the global input interceptors
    const curtain = buildCurtain();
    (document.body || document.documentElement).appendChild(curtain);

    // Promote into the top layer so nothing (not even a top-layer video) sits
    // above it. Falls back silently to the z-index overlay if unsupported.
    try { curtain.showPopover(); } catch (_) {}
    // Pull focus off the page so space/enter can't trigger the focused element.
    try { curtain.focus({ preventScroll: true }); } catch (_) {}

    window.addEventListener("resize", onResize, { passive: true });
  }

  function hide() {
    active = false;
    const curtain = document.getElementById(CURTAIN_ID);
    if (curtain) {
      try { curtain.hidePopover(); } catch (_) {}
      curtain.remove();
    }
    window.removeEventListener("resize", onResize);
  }

  async function toggle() {
    if (document.getElementById(CURTAIN_ID)) {
      hide();
    } else {
      await loadSettings();
      show();
    }
  }

  // ---- wiring -------------------------------------------------------------

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "nanosuit-toggle") {
      toggle();
      sendResponse && sendResponse({ ok: true });
    }
    return false;
  });

  // Live-update an open curtain when settings change in the options page.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      Object.keys(changes).forEach((k) => { settings[k] = changes[k].newValue; });
      if (document.getElementById(CURTAIN_ID)) {
        hide();
        show();
      }
    });
  } catch (_) {}

  loadSettings();
})();
