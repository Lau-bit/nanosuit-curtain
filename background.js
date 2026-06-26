// Nanosuit Curtain - background service worker
// Wires up the context-menu item, the keyboard command and the toolbar
// action so all three just toggle the curtain on the active tab.

const MENU_ID = "nanosuit-toggle";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Toggle Nanosuit Curtain",
    contexts: ["all"]
  });
});

// Re-create the menu when the worker spins back up (onInstalled may not fire).
chrome.runtime.onStartup.addListener(() => {
  chrome.contextMenus.create(
    { id: MENU_ID, title: "Toggle Nanosuit Curtain", contexts: ["all"] },
    () => void chrome.runtime.lastError // ignore "already exists"
  );
});

async function toggleCurtain(tab) {
  if (!tab || tab.id == null) {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = active;
  }
  if (!tab || tab.id == null) return;

  // Some pages (chrome://, the web store, PDF viewer) refuse injection; the
  // try/catch keeps the worker from throwing on those.
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "nanosuit-toggle" });
  } catch (e) {
    // Content script not present yet (e.g. tab opened before install) -> inject
    // it once, then send the toggle again.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
      await chrome.tabs.sendMessage(tab.id, { type: "nanosuit-toggle" });
    } catch (_) {
      /* page disallows injection - nothing we can do */
    }
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) toggleCurtain(tab);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-curtain") toggleCurtain(tab);
});

chrome.action.onClicked.addListener((tab) => toggleCurtain(tab));
