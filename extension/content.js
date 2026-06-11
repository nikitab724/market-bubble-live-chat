/**
 * Market Bubble X Bridge — content script
 *
 * Watches an X livestream page for new chat messages and POSTs them
 * to the configured Market Bubble backend at /api/x-chat.
 *
 * IF X CHANGES THEIR DOM: open DevTools on an X live page, inspect the chat
 * sidebar, find the repeating container element, and update CHAT_SELECTORS
 * and extractMessage() below.
 */

const DEFAULT_BACKEND_BASE_URL = "https://marketbubble.192-210-192-116.sslip.io";
const BACKEND_BASE_URL_STORAGE_KEY = "marketBubbleBackendBaseUrl";
const INGEST_TOKEN_STORAGE_KEY = "marketBubbleIngestToken";

// Selectors tried in order to find the scrollable chat container.
// X uses data-testid attributes that are relatively stable across releases.
// NOTE: avoid matching buttons — the chat *drawer toggle* button uses aria-label="Chat"
// and data-testid="chat-drawer-main". We want the content panel inside it.
const CHAT_SELECTORS = [
  '[data-testid="liveChat"]',
  '[data-testid="chatBody"]',
  '[data-testid="chat-drawer-content"]',
  '[data-testid="SpacesLiveContent"] [data-testid="cellInnerDiv"]',
  '[aria-label="Live chat"]',
];

// Selectors tried in order to find individual message rows inside the container.
const MESSAGE_SELECTORS = [
  '[data-testid="chatMessage"]',
  '[data-testid="liveMessage"]',
  '[data-testid="tweetText"]',
  "article",
  "li",
];

// Keep a fingerprint of recent messages to avoid duplicates.
const seen = new Set();

let chatContainer = null;
let mutationObserver = null;
let currentSourceHandle = null;
let status = "idle"; // "idle" | "watching" | "no-container"

// What the backend last said about this bridge. "Watching chat" only means the
// DOM observer is attached; this is the part that tells the operator whether
// posts are actually accepted. Result states come from backend responses and
// stick; guidance states (soft) only fill in when there is no result yet.
let bridge = { state: "idle", message: "" };
const BRIDGE_RESULT_STATES = new Set(["linked", "unauthorized", "no-source", "error"]);

// ─── State broadcasting ───────────────────────────────────────────────────────

function snapshotState() {
  return { status, sourceHandle: currentSourceHandle, bridge };
}

function broadcastState() {
  chrome.runtime.sendMessage({ type: "status", ...snapshotState() }).catch(() => {});
}

function setStatus(next) {
  status = next;
  broadcastState();
}

function setBridge(state, message = "", { soft = false } = {}) {
  if (soft && BRIDGE_RESULT_STATES.has(bridge.state)) return;
  if (bridge.state === state && bridge.message === message) return;

  bridge = { state, message };
  if (message && state !== "linked") {
    console.warn(`[MB X Bridge] ${message}`);
  }
  broadcastState();
}

// ─── URL / source detection ───────────────────────────────────────────────────

function isLivePage() {
  const path = window.location.pathname;
  return (
    path.includes("/broadcasts/") ||
    path.includes("/spaces/") ||
    path.includes("/live") ||
    document.title.toLowerCase().includes("live") ||
    !!document.querySelector('[data-testid="liveVideoContainer"]')
  );
}

/**
 * Derive the broadcaster handle from the current URL.
 * /Banks/broadcasts/1abc  →  "banks"
 * /i/broadcasts/1abc      →  null  (unknown, popup must select)
 */
function detectHandleFromUrl() {
  const match = window.location.pathname.match(/^\/([^/i][^/]*)\/(?:broadcasts|live)/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Pull the broadcast id from the current live URL, e.g.
 * /i/broadcasts/1yKAPPboWlDxb or /Banks/broadcasts/1abc → "1yKAPPboWlDxb".
 */
function detectBroadcastIdFromUrl() {
  const match = window.location.pathname.match(/\/broadcasts\/([A-Za-z0-9]+)/);
  return match ? match[1] : "";
}

// Report the live broadcast id to the backend so the server-side X chat
// connector can attach without a manual paste. Deduped so SPA re-renders and
// the 1s URL poll do not spam the backend with the same id — but only once the
// backend accepts, so a rejected report retries on the next Apply/Retry/URL
// change instead of failing silently forever.
let lastReportedBroadcast = "";
let reportInFlight = null;

function reportBroadcastId() {
  const broadcastId = detectBroadcastIdFromUrl();
  if (!broadcastId) {
    setBridge("no-broadcast-url", "", { soft: true });
    return Promise.resolve();
  }
  if (!currentSourceHandle) {
    setBridge("no-source-selected", "", { soft: true });
    return Promise.resolve();
  }

  const key = `${currentSourceHandle}:${broadcastId}`;
  if (key === lastReportedBroadcast) return Promise.resolve();
  if (reportInFlight) return reportInFlight;

  reportInFlight = (async () => {
    try {
      const backendBaseUrl = await getBackendBaseUrl();
      const response = await fetch(buildBackendUrl("/api/x-broadcast", backendBaseUrl), {
        method: "POST",
        headers: await buildIngestHeaders(),
        body: JSON.stringify({ sourceHandle: currentSourceHandle, broadcastId }),
      });

      if (response.ok) {
        lastReportedBroadcast = key;
        setBridge("linked");
        console.log(`[MB X Bridge] reported broadcast ${broadcastId} for @${currentSourceHandle}`);
      } else if (response.status === 401) {
        setBridge("unauthorized", `backend ${backendBaseUrl} rejected the bridge token (401)`);
      } else if (response.status === 404) {
        setBridge("no-source", `backend ${backendBaseUrl} has no enabled X source for @${currentSourceHandle} (404)`);
      } else {
        setBridge("error", `broadcast report failed with HTTP ${response.status}`);
      }
    } catch {
      setBridge("error", "backend unreachable — check the Backend URL");
    } finally {
      reportInFlight = null;
    }
  })();

  return reportInFlight;
}

// ─── Message extraction ───────────────────────────────────────────────────────

/**
 * Try to extract { author, handle, body } from a DOM element.
 *
 * Primary strategy: X Live embeds the username in the avatar data-testid:
 *   data-testid="UserAvatar-Container-BenjaminLoken"
 * The display name is in the first profile link, and the message body
 * is the last <span> inside [dir="ltr"] that sits outside any <a> tag.
 *
 * HOW TO UPDATE IF X CHANGES THEIR DOM:
 *   1. In DevTools, click a chat message → Copy → Copy outerHTML
 *   2. Look for: data-testid containing "UserAvatar-Container-"
 *   3. Look for: the last <span> not inside an <a> — that's the message text
 */
function extractMessage(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;

  // Primary: avatar testid encodes the handle reliably
  const avatarEl = el.querySelector('[data-testid^="UserAvatar-Container-"]');
  if (avatarEl) {
    const handle = avatarEl
      .getAttribute("data-testid")
      .replace("UserAvatar-Container-", "")
      .trim();

    if (!handle) return null;

    // Display name: first profile link's visible text (before the @ handle)
    const profileLink = el.querySelector(`a[href="/${handle}"]`);
    const author = profileLink
      ? (profileLink.innerText || profileLink.textContent).split("@")[0].trim() || handle
      : handle;

    // Message body: last <span> inside [dir="ltr"] that isn't a child of <a>
    const textContainer = el.querySelector('[dir="ltr"]');
    if (!textContainer) return null;

    const bodySpan = Array.from(textContainer.children)
      .reverse()
      .find((c) => c.tagName === "SPAN" && !c.querySelector("a") && !c.closest("a"));

    const body = bodySpan ? (bodySpan.innerText || bodySpan.textContent).trim() : "";
    if (!body) return null;

    return { author, handle: handle.toLowerCase(), body };
  }

  // Fallback: link href contains the handle, remaining text is the message
  const links = el.querySelectorAll("a[href^='/']");
  if (links.length > 0) {
    const handleMatch = links[0].getAttribute("href").match(/^\/([^/?#]+)$/);
    if (handleMatch) {
      const handle = handleMatch[1].toLowerCase();
      const author = (links[0].innerText || links[0].textContent).replace(/^@/, "").trim() || handle;
      const fullText = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      const body = fullText.replace(links[0].innerText || "", "").replace(`@${handle}`, "").trim();
      if (author && body && body.length < 500) return { author, handle, body };
    }
  }

  return null;
}

// ─── Sending ──────────────────────────────────────────────────────────────────

async function sendMessage(author, handle, body) {
  const fingerprint = `${handle}:${body}`;

  if (seen.has(fingerprint)) return;
  seen.add(fingerprint);
  if (seen.size > 500) {
    const first = seen.values().next().value;
    seen.delete(first);
  }

  const payload = {
    author,
    handle,
    body,
    timestamp: new Date().toISOString(),
    sourceHandle: currentSourceHandle || "",
  };

  try {
    const backendBaseUrl = await getBackendBaseUrl();
    const response = await fetch(buildBackendUrl("/api/x-chat", backendBaseUrl), {
      method: "POST",
      headers: await buildIngestHeaders(),
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      // Don't downgrade "linked": once the server-side connector owns the
      // source, DOM posts are acknowledged but the connector carries the chat.
      setBridge("chat-ok", "", { soft: true });
    } else if (response.status === 401) {
      setBridge("unauthorized", `backend ${backendBaseUrl} rejected the bridge token (401)`);
    } else if (response.status === 404) {
      setBridge("no-source", `backend ${backendBaseUrl} has no enabled X source for @${payload.sourceHandle || "?"} (404)`);
    } else {
      setBridge("error", `chat post failed with HTTP ${response.status}`);
    }
  } catch {
    setBridge("error", "backend unreachable — check the Backend URL");
  }
}

async function getBackendBaseUrl() {
  const stored = await chrome.storage.local.get({
    [BACKEND_BASE_URL_STORAGE_KEY]: DEFAULT_BACKEND_BASE_URL,
  });

  return normalizeBackendBaseUrl(stored[BACKEND_BASE_URL_STORAGE_KEY]);
}

// The backend requires this token once an admin password is set; the operator
// pastes it into the popup after logging into the admin page. The token is the
// only secret the bridge holds, and it lives in extension storage, not code.
async function buildIngestHeaders() {
  const stored = await chrome.storage.local.get({ [INGEST_TOKEN_STORAGE_KEY]: "" });
  const token = String(stored[INGEST_TOKEN_STORAGE_KEY] || "").trim();
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function buildBackendUrl(path, backendBaseUrl) {
  return `${normalizeBackendBaseUrl(backendBaseUrl)}${path.startsWith("/") ? path : `/${path}`}`;
}

function normalizeBackendBaseUrl(value) {
  const url = String(value || DEFAULT_BACKEND_BASE_URL).trim().replace(/\/+$/, "");
  return url || DEFAULT_BACKEND_BASE_URL;
}

// ─── DOM observation ──────────────────────────────────────────────────────────

function handleAddedNodes(nodes) {
  for (const node of nodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    // Try the node itself first
    const direct = extractMessage(node);
    if (direct) {
      sendMessage(direct.author, direct.handle, direct.body);
      continue;
    }

    // Walk up: if this node contains an avatar testid, find its message ancestor
    const avatar = node.querySelector('[data-testid^="UserAvatar-Container-"]');
    if (avatar) {
      // Walk up from the avatar to find the full message container
      let candidate = avatar.parentElement;
      while (candidate && candidate !== node.ownerDocument.body) {
        const result = extractMessage(candidate);
        if (result) {
          sendMessage(result.author, result.handle, result.body);
          break;
        }
        candidate = candidate.parentElement;
      }
      continue;
    }

    // Fallback: try known message selectors within the node
    for (const selector of MESSAGE_SELECTORS) {
      for (const el of node.querySelectorAll(selector)) {
        const result = extractMessage(el);
        if (result) sendMessage(result.author, result.handle, result.body);
      }
    }
  }
}

function startObserving() {
  if (mutationObserver) mutationObserver.disconnect();

  mutationObserver = new MutationObserver((mutations) => {
    const added = mutations.flatMap((m) => Array.from(m.addedNodes));
    if (added.length) handleAddedNodes(added);
  });

  // Watch the full document — no need to find the chat container since we
  // identify messages by their UserAvatar-Container-* data-testid fingerprint.
  mutationObserver.observe(document.body, { childList: true, subtree: true });
  setStatus("watching");
  console.log("[MB X Bridge] Watching document.body for X Live chat messages");
}

function tryAttach() {
  if (!isLivePage()) {
    setStatus("idle");
    return;
  }

  startObserving();
  reportBroadcastId();
}

// ─── SPA navigation ──────────────────────────────────────────────────────────
// Detect URL changes (X is a SPA) via a separate interval — avoids needing
// a second MutationObserver on body competing with the chat observer.

let lastUrl = location.href;

setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // /i/broadcasts/<id> URLs carry no handle; keep the popup-selected source
    // instead of clobbering it with null on every SPA navigation.
    currentSourceHandle = detectHandleFromUrl() || currentSourceHandle;
    setTimeout(tryAttach, 1000); // wait for new page content to render
  }
}, 1000);

// ─── Message from popup ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "get-status") {
    sendResponse(snapshotState());
  }

  if (message.type === "set-source") {
    currentSourceHandle = message.sourceHandle;
    lastReportedBroadcast = "";
    // Respond after the broadcast report settles so the popup shows the
    // backend's verdict, not just "watching".
    reportBroadcastId().then(() => sendResponse(snapshotState()));
    return true;
  }

  if (message.type === "retry") {
    chatContainer = null;
    if (mutationObserver) mutationObserver.disconnect();
    if (!isLivePage()) {
      setStatus("idle");
      sendResponse(snapshotState());
      return;
    }

    startObserving();
    reportBroadcastId().then(() => sendResponse(snapshotState()));
    return true;
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

currentSourceHandle = detectHandleFromUrl();
tryAttach();
