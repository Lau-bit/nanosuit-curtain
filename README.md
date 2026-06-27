# Nanosuit Curtain

Drop a non-distracting **curtain** over the current tab to deprioritize a window
without touching anything underneath. The page keeps running (audio, timers,
logins, uploads) — the curtain just hides it and blocks clicks so you don't poke
the page by accident. Toggle it back off any time.

Default look is a Crysis-style **nanosuit hexagon field**: dark carbon panels with
subtle glowing orange "energy" seams, faint per-panel variation, and the occasional
broken/missing panel. Or paste in your own image.

## Toggle four ways (all one action)

- **Browser hotkey:** `Alt + Shift + H`
- **Right-click → "Toggle Nanosuit Curtain"**
- **Click the toolbar icon**
- **Your own in-page hotkey** — set it on the Options page (see below)

Rebind the browser hotkey at `vivaldi://extensions/shortcuts` (or `chrome://extensions/shortcuts`).

## Customize

Open the extension's **Options/Settings** page (right-click the toolbar icon →
Options, or via the extensions manager):

- **Curtain type** — Hexagon pattern *or* a custom image (paste from clipboard
  with `Ctrl+V`, or pick a file).
- **Image fit** — cover / contain / tile / center.
- **Hexagon look** — carbon color, energy glow color, glow intensity, hexagon size,
  animated glow on/off.
- **General** — curtain opacity, dismiss-hint on/off, and an optional
  *keyboard pass-through* (off by default): when on, the keyboard still operates
  the page through the curtain — so page/extension shortcuts like Space to
  play/pause or change playback speed on YouTube keep working — while the **mouse
  stays blocked**. With pass-through on you can also enable a **media HUD**: when a
  hotkey changes playback (from the page or another extension like *youtube-toolbox*),
  a small readout — e.g. `2×`, `Volume 60%`, `Paused ⏸`, `Loop on` — flashes over the
  curtain. It's derived from the real `<video>`/`<audio>` state (media events plus a
  `loop`-attribute watcher), so it works no matter which extension triggered the change.
- **Toggle hotkey** — define your own in-page shortcut (a single key or any
  modifier combo). Click the capture button, press the keys, done. It works
  whether the curtain is open or closed and is separate from the rebindable
  browser shortcut. Press `Esc` while capturing to cancel; **Clear** removes it.

A live preview on the right shows your settings. Changes apply to an already-open
curtain immediately.

## Install (unpacked)

1. Go to `vivaldi://extensions` (or `chrome://extensions`).
2. Enable **Developer mode**.
3. **Load unpacked** → select this `nanosuit-curtain` folder.

## Notes

- Built on Manifest V3. The curtain is a single top-layer overlay (Popover API,
  so it sits above even a page's fullscreen/top-layer video like YouTube's player).
  While it's up, page mouse **and** keyboard input is blocked at the window level
  (so YouTube's space/k/arrow shortcuts can't drive the hidden video), but
  browser-level shortcuts still work: **Ctrl+R** refreshes (which reloads the page
  and clears the curtain), and the `Alt+Shift+H` toggle is always available.
- Right-click still opens the native menu (with the toggle item) while the curtain
  is up, so you can dismiss it that way too.
- Browser-internal pages (`chrome://`, `vivaldi://`, the Web Store, the PDF viewer)
  don't allow content scripts, so the curtain can't cover those.
- The curtain does not persist across page reloads/navigations by design — open it
  again when you want it.
