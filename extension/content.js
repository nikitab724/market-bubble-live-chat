/**
 * Market Bubble X Bridge — content script
 *
 * Watches an X livestream page for new chat messages and POSTs them
 * to the local Market Bubble backend at http://localhost:4178/api/x-chat.
 *
 * IF X CHANGES THEIR DOM: open DevTools on an X live page, inspect the chat
 * sidebar, find the repeating container element, and update CHAT_SELECTORS
 * and extractMessage() below.
 */

const BACKEND_URL = "http://localhost:4178/api/x-chat";

// Selectors tried in order to find the scrollable chat container.
// X uses data-testid attributes that are relatively stable across releases.
const CHAT_SELECTORS = [
  '[data-testid="liveChat"]',
  '[data-testid="chatBody"]',
  '[data-testid="SpacesLiveContent"] [data-testid="cellInnerDiv"]',
  '[aria-label="Live chat"]',
  '[aria-label="Chat"]',
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

// ─── State broadcasting ───────────────────────────────────────────────────────

function setStatus(next) {
  status = next;
  chrome.runtime.sendMessage({ type: "status", status, sourceHandle: currentSourceHandle }).catch(() => {});
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

// ─── Message extraction ───────────────────────────────────────────────────────

/**
 * Try to extract { author, body } from a DOM element.
 * Returns null if the element doesn't look like a chat message.
 *
 * HOW TO UPDATE: In DevTools, pick a single message element and note:
 *  - Which child element contains the username
 *  - Which child element contains the message text
 * Then add a case to the extraction attempts below.
 */
function extractMessage(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;

  const fullText = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  if (!fullText || fullText.length > 500 || fullText.length < 2) return null;

  // Attempt 1: explicit data-testid children
  const authorEl = el.querySelector('[data-testid*="author"], [data-testid*="username"], [data-testid*="User"] a');
  const bodyEl = el.querySelector('[data-testid="tweetText"], [data-testid="chatMessageText"], [data-testid="messageText"]');

  if (authorEl && bodyEl) {
    const author = authorEl.innerText.replace(/^@/, "").trim();
    const body = bodyEl.innerText.trim();
    if (author && body) return { author, body };
  }

  // Attempt 2: first link looks like a handle, rest is text
  const links = el.querySelectorAll("a[href*='/']");
  if (links.length > 0) {
    const handleMatch = links[0].href.match(/x\.com\/([^/?#]+)/);
    if (handleMatch) {
      const author = handleMatch[1];
      const bodyText = fullText.replace(links[0].innerText || "", "").trim();
      if (author && bodyText) return { author: author.replace(/^@/, ""), body: bodyText };
    }
  }

  // Attempt 3: "Author: message" or "Author message" pattern
  // X Live sometimes renders as "DisplayName message" with the name bolded
  const spans = el.querySelectorAll("span, strong, b");
  if (spans.length >= 2) {
    const author = spans[0].innerText.trim().replace(/^@/, "").replace(/:$/, "");
    const body = Array.from(spans)
      .slice(1)
      .map((s) => s.innerText.trim())
      .join(" ")
      .trim();
    if (author && body && author.length < 60 && !author.includes("\n")) {
      return { author, body };
    }
  }

  return null;
}

// ─── Sending ──────────────────────────────────────────────────────────────────

async function sendMessage(author, body) {
  const handle = author.toLowerCase().replace(/\s+/g, "_");
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
    await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Backend not running — silently ignore, user will see disconnected state in dashboard.
  }
}

// ─── DOM observation ──────────────────────────────────────────────────────────

function handleAddedNodes(nodes) {
  for (const node of nodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    // Try the node itself
    const direct = extractMessage(node);
    if (direct) {
      sendMessage(direct.author, direct.body);
      continue;
    }

    // Try known message selectors within the node
    for (const selector of MESSAGE_SELECTORS) {
      for (const el of node.querySelectorAll(selector)) {
        const result = extractMessage(el);
        if (result) sendMessage(result.author, result.body);
      }
    }
  }
}

function findChatContainer() {
  for (const selector of CHAT_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function startObserving(container) {
  if (mutationObserver) mutationObserver.disconnect();

  chatContainer = container;
  mutationObserver = new MutationObserver((mutations) => {
    const added = mutations.flatMap((m) => Array.from(m.addedNodes));
    if (added.length) handleAddedNodes(added);
  });

  mutationObserver.observe(container, { childList: true, subtree: true });
  setStatus("watching");
  console.log("[MB X Bridge] Watching chat container:", container);
}

function tryAttach() {
  if (!isLivePage()) {
    setStatus("idle");
    return;
  }

  const container = findChatContainer();
  if (container && container !== chatContainer) {
    startObserving(container);
    return;
  }

  if (!container) {
    setStatus("no-container");
    // Retry — X loads chat asynchronously after the video
    setTimeout(tryAttach, 2000);
  }
}

// ─── SPA navigation ──────────────────────────────────────────────────────────

let lastUrl = location.href;

new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    chatContainer = null;
    if (mutationObserver) mutationObserver.disconnect();
    currentSourceHandle = detectHandleFromUrl();
    setTimeout(tryAttach, 1000); // wait for new page content
  }
}).observe(document.body, { childList: true, subtree: true });

// ─── Message from popup ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "get-status") {
    sendResponse({ status, sourceHandle: currentSourceHandle });
  }

  if (message.type === "set-source") {
    currentSourceHandle = message.sourceHandle;
    sendResponse({ ok: true });
  }

  if (message.type === "retry") {
    chatContainer = null;
    if (mutationObserver) mutationObserver.disconnect();
    tryAttach();
    sendResponse({ ok: true });
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

currentSourceHandle = detectHandleFromUrl();
tryAttach();
