const STATUS_LABELS = {
  watching: "Watching chat",
  idle: "Not on a live page",
  "no-container": "Live page detected — chat not found yet",
};

const FALLBACK_X_SOURCES = [
  { sourceHandle: "banks", sourceLabel: "Banks" },
  { sourceHandle: "z", sourceLabel: "Z" },
];

async function getXSources() {
  try {
    const r = await fetch("https://marketbubble.192-210-192-116.sslip.io/api/public-config");
    const data = await r.json();
    const sources = (data.sources || []).filter((s) => s.platform === "x");
    if (sources.length > 0) return sources;
  } catch {
    // fall through to hardcoded list
  }
  return FALLBACK_X_SOURCES;
}

async function sendToContent(tab, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, message, (response) => {
      resolve(response);
    });
  });
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const isXPage =
    tab.url?.includes("x.com") || tab.url?.includes("twitter.com");

  const notLive = document.querySelector("#notLive");
  const liveControls = document.querySelector("#liveControls");

  if (!isXPage) {
    notLive.style.display = "block";
    liveControls.style.display = "none";
    return;
  }

  notLive.style.display = "none";
  liveControls.style.display = "block";

  const dot = document.querySelector("#dot");
  const statusText = document.querySelector("#statusText");
  const sourceSelect = document.querySelector("#sourceSelect");

  // Load X sources from backend
  const sources = await getXSources();
  for (const source of sources) {
    const opt = document.createElement("option");
    opt.value = source.sourceHandle;
    opt.textContent = source.sourceLabel || source.sourceName;
    sourceSelect.appendChild(opt);
  }

  // Get current status from content script
  const state = await sendToContent(tab, { type: "get-status" });

  if (state) {
    const s = state.status || "idle";
    dot.className = `dot ${s}`;
    statusText.innerHTML = `<strong>${STATUS_LABELS[s] || s}</strong>`;

    if (state.sourceHandle) {
      sourceSelect.value = state.sourceHandle;
    }
  }

  document.querySelector("#retryBtn").addEventListener("click", async () => {
    await sendToContent(tab, { type: "retry" });
    window.close();
  });

  document.querySelector("#applyBtn").addEventListener("click", async () => {
    const handle = sourceSelect.value;
    if (handle) {
      await sendToContent(tab, { type: "set-source", sourceHandle: handle });
    }
    window.close();
  });
}

init();
