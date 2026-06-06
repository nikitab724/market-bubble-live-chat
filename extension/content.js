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

const BACKEND_URL = "https://marketbubble.192-210-192-116.sslip.io/api/x-chat";

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

function findChatContainer() {
  for (const selector of CHAT_SELECTORS) {
    const el = document.querySelector(selector);
    // Never return a button — that's the chat *toggle*, not the chat feed
    if (el && el.tagName !== "BUTTON") return el;
  }

  // Fallback: find the chat drawer button and watch its parent for the content panel
  const drawerBtn = document.querySelector('[data-testid="chat-drawer-main"]');
  if (drawerBtn) {
    const panel = drawerBtn.closest('[role="complementary"]') ||
                  drawerBtn.parentElement?.parentElement;
    if (panel && panel.tagName !== "BUTTON") return panel;
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
