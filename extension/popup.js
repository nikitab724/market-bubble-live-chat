const STATUS_LABELS = {
  watching: "Watching chat",
  idle: "Not on a live page",
  "no-container": "Live page detected — chat not found yet",
};

// One actionable line about what the backend said. "Watching chat" above only
// means the DOM observer is attached; this is the part that breaks silently.
const BRIDGE_LABELS = {
  linked: { tone: "ok", text: "Linked — server is watching this broadcast's chat" },
  "chat-ok": { tone: "ok", text: "Backend is accepting bridged chat" },
  unauthorized: { tone: "err", text: "Token rejected — copy it from this backend's admin page" },
  "no-source": { tone: "err", text: "Backend has no X source for the selected handle" },
  "wrong-owner": { tone: "err", text: "This broadcast belongs to a different account — reselect the source" },
  error: { tone: "err", text: "Backend unreachable — check the Backend URL" },
  "no-broadcast-url": { tone: "warn", text: "Open the stream's x.com/i/broadcasts/… page to link it" },
  "no-source-selected": { tone: "warn", text: "Pick a source below, then Apply" },
};

const FALLBACK_X_SOURCES = [
  { sourceHandle: "banks", sourceLabel: "Banks" },
  { sourceHandle: "z", sourceLabel: "Z" },
];

const DEFAULT_BACKEND_BASE_URL = "https://marketbubble.192-210-192-116.sslip.io";
const BACKEND_BASE_URL_STORAGE_KEY = "marketBubbleBackendBaseUrl";
const INGEST_TOKEN_STORAGE_KEY = "marketBubbleIngestToken";

async function getBackendBaseUrl() {
  const stored = await chrome.storage.local.get({
    [BACKEND_BASE_URL_STORAGE_KEY]: DEFAULT_BACKEND_BASE_URL,
  });

  return normalizeBackendBaseUrl(stored[BACKEND_BASE_URL_STORAGE_KEY]);
}

async function saveBackendBaseUrl(value) {
  const backendBaseUrl = normalizeBackendBaseUrl(value);
  await chrome.storage.local.set({ [BACKEND_BASE_URL_STORAGE_KEY]: backendBaseUrl });
  return backendBaseUrl;
}

async function getIngestToken() {
  const stored = await chrome.storage.local.get({ [INGEST_TOKEN_STORAGE_KEY]: "" });
  return String(stored[INGEST_TOKEN_STORAGE_KEY] || "").trim();
}

async function saveIngestToken(value) {
  const token = String(value || "").trim();
  await chrome.storage.local.set({ [INGEST_TOKEN_STORAGE_KEY]: token });
  return token;
}

function buildBackendUrl(path, backendBaseUrl) {
  return `${normalizeBackendBaseUrl(backendBaseUrl)}${path.startsWith("/") ? path : `/${path}`}`;
}

function normalizeBackendBaseUrl(value) {
  const url = String(value || DEFAULT_BACKEND_BASE_URL).trim().replace(/\/+$/, "");
  return url || DEFAULT_BACKEND_BASE_URL;
}

async function getXSources(backendBaseUrl) {
  try {
    const r = await fetch(buildBackendUrl("/api/public-config", backendBaseUrl));
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
  const bridgeText = document.querySelector("#bridgeText");
  const sourceSelect = document.querySelector("#sourceSelect");
  const backendUrlInput = document.querySelector("#backendUrlInput");
  const ingestTokenInput = document.querySelector("#ingestTokenInput");

  function renderState(state) {
    if (!state) {
      dot.className = "dot idle";
      statusText.innerHTML = "<strong>Bridge not running in this tab</strong>";
      bridgeText.hidden = false;
      bridgeText.className = "bridge-text warn";
      bridgeText.textContent = "Reload the X tab, then reopen this popup";
      return;
    }

    const s = state.status || "idle";
    dot.className = `dot ${s}`;
    statusText.innerHTML = `<strong>${STATUS_LABELS[s] || s}</strong>`;

    const verdict = BRIDGE_LABELS[state.bridge?.state];
    bridgeText.hidden = !verdict;
    if (verdict) {
      bridgeText.className = `bridge-text ${verdict.tone}`;
      bridgeText.textContent = verdict.text;
    }

    if (state.sourceHandle) {
      sourceSelect.value = state.sourceHandle;
    }
  }

  const backendBaseUrl = await getBackendBaseUrl();
  backendUrlInput.value = backendBaseUrl;
  ingestTokenInput.value = await getIngestToken();

  // Load X sources from backend
  const sources = await getXSources(backendBaseUrl);
  for (const source of sources) {
    const opt = document.createElement("option");
    opt.value = source.sourceHandle;
    opt.textContent = source.sourceLabel || source.sourceName;
    sourceSelect.appendChild(opt);
  }

  renderState(await sendToContent(tab, { type: "get-status" }));

  // Both buttons keep the popup open and re-render the backend's verdict —
  // closing it was how token/handle rejections went unseen.
  document.querySelector("#retryBtn").addEventListener("click", async () => {
    renderState(await sendToContent(tab, { type: "retry" }));
  });

  document.querySelector("#applyBtn").addEventListener("click", async () => {
    await saveBackendBaseUrl(backendUrlInput.value);
    await saveIngestToken(ingestTokenInput.value);
    const handle = sourceSelect.value;
    if (handle) {
      renderState(await sendToContent(tab, { type: "set-source", sourceHandle: handle }));
    } else {
      renderState(await sendToContent(tab, { type: "get-status" }));
    }
  });
}

init();
