import {
  buildPlatformStats,
  buildViewerSummary,
  mergeMessages,
  normalizeMessage,
} from "./chat-model.mjs";
import { renderMessageBody } from "./emote-renderer.mjs";

// ── Stream tab configuration ──────────────────────────────────────────────────
//
// Tabs are built dynamically from /api/public-config after boot.
// One tab is created per Twitch source; "Both" is always appended last.

const BOTH_TAB = { id: "both", label: "Both", twitchChannel: null, sourceIds: [] };
let ALL_TABS = [BOTH_TAB];

function buildTabsFromSources(sources) {
  const twitchTabs = sources
    .filter((s) => s.platform === "twitch")
    .map((s) => ({
      id: s.sourceId,
      label: s.sourceLabel || s.sourceName || s.sourceHandle,
      twitchChannel: s.sourceHandle,
      sourceIds: [s.sourceId],
    }));
  return [...twitchTabs, BOTH_TAB];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LIVE_STATE_REFRESH_MS = 30_000;
const CHAT_RENDER_INTERVAL_MS = 80;
const CHAT_BOTTOM_THRESHOLD_PX = 8;
const MSG_PER_MIN_WINDOW_MS = 60_000;
const MAX_MESSAGES = 200;
const PLATFORM_ORDER = ["twitch", "kick", "x", "room"];
const PLATFORM_LABELS = { twitch: "Twitch", kick: "Kick", x: "X", room: "MB.com" };

// ── Fallback sources (used if API is unreachable) ─────────────────────────────

const fallbackSources = [];

// ── App state ─────────────────────────────────────────────────────────────────

let connectedSources = fallbackSources.map((s) => ({ ...s }));
let sourceById = buildSourceMap(connectedSources);
let lastRenderAt = 0;
let queuedRenderFrame = 0;
let queuedRenderTimer = 0;
let queuedScrollFrame = 0;
let renderedMessageIds = [];
let knownMessageIds = new Set();

const state = {
  activeTabId: BOTH_TAB.id,
  followingChat: true,
  inspectingProfile: false,
  messages: [],
  pendingChatRender: false,
  sources: [],
  twitchEmotes: {},
  twitchStatuses: {},
};

// ── DOM elements ──────────────────────────────────────────────────────────────

const el = {
  chatFeed:          document.querySelector("#chatFeed"),
  jumpToLive:        document.querySelector("#jumpToLive"),
  mainGrid:          document.querySelector(".v2-main"),
  offlineScreen:     document.querySelector("#offlineScreen"),
  platformBreakdown: document.querySelector("#platformBreakdown"),
  statActiveChatters:document.querySelector("#statActiveChatters"),
  statMsgPerMin:     document.querySelector("#statMsgPerMin"),
  statTotalMessages: document.querySelector("#statTotalMessages"),
  statTotalViewers:  document.querySelector("#statTotalViewers"),
  streamTabs:        document.querySelector("#streamTabs"),
  streamTitle:       document.querySelector("#streamTitle"),
  streamerAvatar:    document.querySelector("#streamerAvatar"),
  streamerName:      document.querySelector("#streamerName"),
  twitchPlayer:      document.querySelector("#twitchPlayer"),
  liveBadge:         document.querySelector("#liveBadge"),
  followBtn:         document.querySelector("#followBtn"),
  subscribeBtn:      document.querySelector("#subscribeBtn"),
  expandBtn:         document.querySelector("#expandBtn"),
  expandIcon:        document.querySelector("#expandIcon"),
  collapseIcon:      document.querySelector("#collapseIcon"),
  streamPanel:       document.querySelector(".v2-stream-panel"),
};

// ── Boot ──────────────────────────────────────────────────────────────────────

bindEvents();
await initializeApp();
window.setInterval(refreshLiveState, LIVE_STATE_REFRESH_MS);

// ── Initialization ────────────────────────────────────────────────────────────

async function initializeApp() {
  connectedSources = await loadPublicConfig();
  sourceById = buildSourceMap(connectedSources);
  state.sources = connectedSources.map((s) => ({ ...s }));
  state.twitchStatuses = Object.fromEntries(
    connectedSources
      .filter((s) => s.platform === "twitch")
      .map((s) => [s.sourceId, "connecting"]),
  );

  ALL_TABS = buildTabsFromSources(connectedSources);
  state.activeTabId = ALL_TABS[0].id;
  renderTabs();

  render();
  initTwitchPlayer();
  loadTwitchEmotes();
  startBackendChatEvents();
  refreshLiveState();
}

async function loadPublicConfig() {
  try {
    const r = await fetch("/api/public-config", { cache: "no-store" });
    if (!r.ok) throw new Error("config failed");
    const data = await r.json();
    if (Array.isArray(data.sources) && data.sources.length > 0) return data.sources;
  } catch {
    // ignore
  }
  return fallbackSources.map((s) => ({ ...s }));
}

// ── Twitch player ─────────────────────────────────────────────────────────────

function initTwitchPlayer(channel) {
  if (!el.twitchPlayer) return;

  const twitchChannel = channel || getActiveTab()?.twitchChannel || "xqc";

  if (!twitchChannel) return;

  const twitchSource = connectedSources.find(
    (s) => s.platform === "twitch" && s.sourceHandle === twitchChannel,
  ) || connectedSources.find((s) => s.platform === "twitch");

  if (twitchSource) {
    if (el.streamerName) el.streamerName.textContent = twitchSource.sourceLabel || twitchSource.sourceName || twitchChannel;
    if (el.streamerAvatar) el.streamerAvatar.textContent = (twitchSource.sourceLabel || twitchChannel).charAt(0).toUpperCase();
    if (el.followBtn) el.followBtn.href = `https://twitch.tv/${twitchChannel}`;
    if (el.subscribeBtn) el.subscribeBtn.href = `https://twitch.tv/subs/${twitchChannel}`;
  }

  const source = twitchSource || connectedSources.find((s) => s.platform === "twitch");
  const isLive = source?.isLive === true;

  if (isLive) {
    setTwitchPlayerChannel(twitchChannel);
  } else {
    loadLatestVod(twitchChannel);
  }
}

function setTwitchPlayerChannel(channel) {
  const parent = window.location.hostname || "localhost";
  const iframe = document.createElement("iframe");
  iframe.src = `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(parent)}&autoplay=true`;
  iframe.allowFullscreen = true;
  iframe.allow = "autoplay; fullscreen";
  iframe.title = `${channel} on Twitch`;
  el.twitchPlayer.replaceChildren(iframe);
}

async function loadLatestVod(channel) {
  try {
    const r = await fetch(`/api/twitch-vod?channel=${encodeURIComponent(channel)}`, { cache: "no-store" });
    if (!r.ok) return setTwitchPlayerChannel(channel);
    const data = await r.json();
    if (!data.vod?.id) return setTwitchPlayerChannel(channel);

    const parent = window.location.hostname || "localhost";
    const iframe = document.createElement("iframe");
    iframe.src = `https://player.twitch.tv/?video=${encodeURIComponent(data.vod.id)}&parent=${encodeURIComponent(parent)}&autoplay=false`;
    iframe.allowFullscreen = true;
    iframe.allow = "autoplay; fullscreen";
    iframe.title = data.vod.title || `${channel} on Twitch`;
    el.twitchPlayer.replaceChildren(iframe);
  } catch {
    setTwitchPlayerChannel(channel);
  }
}

// ── Connectors ────────────────────────────────────────────────────────────────

async function loadTwitchEmotes() {
  for (const source of connectedSources.filter((s) => s.platform === "twitch")) {
    try {
      const r = await fetch(`/api/twitch-emotes?channel=${encodeURIComponent(source.sourceHandle)}`, {
        cache: "no-store",
      });
      if (!r.ok) continue;
      const data = await r.json();
      state.twitchEmotes[source.sourceId] = data.emotes || {};
      queueRender();
    } catch {
      // emotes unavailable
    }
  }
}

function startBackendChatEvents() {
  if (!("EventSource" in window)) return;
  const events = new EventSource("/api/chat-events");
  events.addEventListener("chat", (e) => addMessage(JSON.parse(e.data)));
  events.addEventListener("chat-status", (e) => {
    updateBackendChatStatus(JSON.parse(e.data));
  });
}

function updateBackendChatStatus(rawStatus) {
  const sourceId = String(rawStatus?.sourceId || "");
  if (rawStatus?.platform !== "twitch" || !sourceId || !sourceById.has(sourceId)) return;

  state.twitchStatuses[sourceId] = String(rawStatus.status || "connecting");
  queueRender();
}

// ── Live state ────────────────────────────────────────────────────────────────

async function refreshLiveState() {
  try {
    const r = await fetch("/api/live-state", { cache: "no-store" });
    if (!r.ok) return;
    const liveState = await r.json();
    if (!Array.isArray(liveState.sources)) return;

    const byId = new Map(liveState.sources.map((s) => [s.sourceId, s]));
    state.sources = state.sources.map((source) => {
      const live = byId.get(source.sourceId);
      if (!live) return source;
      return {
        ...source,
        gameName:     live.gameName || "",
        isLive:       live.isLive === true,
        startedAt:    live.startedAt || "",
        streamTitle:  live.title || "",
        thumbnailUrl: live.thumbnailUrl || "",
        viewerCount:  Number(live.viewerCount || 0),
        viewerCountLocked: true,
      };
    });

    updateStreamHeader();
    queueRender();
  } catch {
    // keep existing values
  }
}

let lastLiveState = null;

function updateStreamHeader() {
  const tab = getActiveTab();
  const tabSources = getTabSources(tab);
  const liveSources = tabSources.filter((s) => s.isLive);
  const primaryLive = liveSources[0];
  const nowLive = !!primaryLive;

  if (primaryLive) {
    if (el.liveBadge) { el.liveBadge.textContent = "Live"; el.liveBadge.dataset.state = "live"; }
    if (el.streamTitle && primaryLive.streamTitle) el.streamTitle.textContent = primaryLive.streamTitle;
  } else {
    if (el.liveBadge) { el.liveBadge.textContent = "Offline"; el.liveBadge.dataset.state = "offline"; }
  }

  if (el.mainGrid) el.mainGrid.hidden = !nowLive;
  if (el.offlineScreen) el.offlineScreen.hidden = nowLive;

  // Reload the player if live status changed since last check
  if (lastLiveState !== null && lastLiveState !== nowLive) {
    const twitchChannel = tab.twitchChannel || connectedSources.find((s) => s.platform === "twitch")?.sourceHandle;
    if (twitchChannel) {
      if (nowLive) {
        setTwitchPlayerChannel(twitchChannel);
      } else {
        loadLatestVod(twitchChannel);
      }
    }
  }
  lastLiveState = nowLive;
}

// ── Tab management ────────────────────────────────────────────────────────────

function getActiveTab() {
  return ALL_TABS.find((t) => t.id === state.activeTabId) || ALL_TABS[0];
}

function getTabSources(tab) {
  if (!tab || tab.sourceIds.length === 0) return state.sources;
  return state.sources.filter((s) => tab.sourceIds.includes(s.sourceId));
}

function getTabMessages(tab) {
  if (!tab || tab.sourceIds.length === 0) return state.messages;
  return state.messages.filter((m) => tab.sourceIds.includes(m.sourceId));
}

function renderTabs() {
  if (!el.streamTabs) return;
  el.streamTabs.innerHTML = ALL_TABS.map((tab) => `
    <button
      class="v2-tab"
      role="tab"
      data-tab-id="${tab.id}"
      aria-selected="${tab.id === state.activeTabId}"
    >${escapeHtml(tab.label)}</button>
  `).join("");

  el.streamTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".v2-tab");
    if (!btn) return;
    const tabId = btn.dataset.tabId;
    if (tabId === state.activeTabId) return;

    state.activeTabId = tabId;
    renderedMessageIds = [];
    state.followingChat = true;

    // Clear the chat DOM so the next render does a clean append into an empty stack
    const oldStack = el.chatFeed.querySelector(".v2-chat-stack");
    if (oldStack) oldStack.innerHTML = "";

    el.streamTabs.querySelectorAll(".v2-tab").forEach((b) => {
      b.setAttribute("aria-selected", String(b.dataset.tabId === tabId));
    });

    const tab = getActiveTab();
    if (tab.twitchChannel) initTwitchPlayer(tab.twitchChannel);

    updateStreamHeader();
    queueRender();
  });
}

// ── Message management ────────────────────────────────────────────────────────

function addMessage(rawMessage) {
  const message = normalizeMessage(rawMessage);
  if (knownMessageIds.has(message.id)) return false;

  knownMessageIds.add(message.id);
  const last = state.messages.at(-1);
  if (!last || compareMessageOrder(last, message) <= 0) {
    state.messages.push(message);
  } else {
    state.messages = mergeMessages([...state.messages, message]);
  }

  queueRender();
  return true;
}

function compareMessageOrder(left, right) {
  const dt = Date.parse(left.timestamp) - Date.parse(right.timestamp);
  if (dt !== 0) return dt;
  return PLATFORM_ORDER.indexOf(left.platform) - PLATFORM_ORDER.indexOf(right.platform);
}

function buildSourceMap(sources) {
  return new Map(sources.map((s) => [s.sourceId, s]));
}

// ── Render queue ──────────────────────────────────────────────────────────────

function queueRender() {
  if (queuedRenderFrame || queuedRenderTimer) return;

  const elapsed = window.performance.now() - lastRenderAt;
  const delay = Math.max(0, CHAT_RENDER_INTERVAL_MS - elapsed);

  queuedRenderTimer = window.setTimeout(() => {
    queuedRenderTimer = 0;
    queuedRenderFrame = window.requestAnimationFrame(() => {
      queuedRenderFrame = 0;
      render();
    });
  }, delay);
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  lastRenderAt = window.performance.now();

  const tab = getActiveTab();
  const tabMessages = getTabMessages(tab);
  const tabSources = getTabSources(tab);

  renderStats(tabMessages, tabSources);
  renderChatFeed(tabMessages);
}

function renderStats(messages, sources) {
  const viewerSummary = buildViewerSummary(sources);
  const totalViewers = viewerSummary.total;

  const now = Date.now();
  const recentMessages = messages.filter(
    (m) => now - Date.parse(m.timestamp) <= MSG_PER_MIN_WINDOW_MS,
  );

  const activeChatters = new Set(messages.map((m) => `${m.platform}:${m.handle.toLowerCase()}`)).size;
  const totalMessages = messages.length;
  const msgPerMin = recentMessages.length;

  el.statTotalViewers.textContent = formatNumber(totalViewers);
  el.statActiveChatters.textContent = formatNumber(activeChatters);
  el.statTotalMessages.textContent = formatNumber(totalMessages);
  el.statMsgPerMin.textContent = formatNumber(msgPerMin);

  renderPlatformBreakdown(messages);
}

function renderPlatformBreakdown(messages) {
  const stats = buildPlatformStats(messages);
  const totalMsgs = messages.length || 1;

  const rows = PLATFORM_ORDER
    .filter((p) => stats[p]?.messages > 0)
    .map((platform) => {
      const count = stats[platform].messages;
      const pct = Math.round((count / totalMsgs) * 100);
      return `
        <div class="v2-platform-row">
          <div class="v2-platform-row-meta">
            <span class="v2-platform-label">
              <span class="v2-platform-dot ${platform}"></span>
              ${escapeHtml(PLATFORM_LABELS[platform] || platform)}
            </span>
            <span class="v2-platform-count">${formatNumber(count)}</span>
            <span class="v2-platform-pct">${pct}%</span>
          </div>
          <div class="v2-platform-bar-track">
            <div class="v2-platform-bar-fill ${platform}" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    });

  el.platformBreakdown.innerHTML = rows.join("");
}

// ── Chat rendering ────────────────────────────────────────────────────────────

function renderChatFeed(messages) {
  const shouldFollow = state.followingChat || isChatAtBottom();
  state.followingChat = shouldFollow;

  if (state.inspectingProfile) {
    state.pendingChatRender = true;
    updateJumpToLive();
    return;
  }

  state.pendingChatRender = false;

  // Cap to avoid unbounded DOM growth
  const visibleMessages = messages.slice(-MAX_MESSAGES);
  const messageIds = visibleMessages.map((m) => m.id);
  const stack = getChatStack();

  // Snapshot scroll position relative to bottom before mutating the DOM
  const scrollBottom = el.chatFeed.scrollHeight - el.chatFeed.scrollTop;

  if (canAppendMessages(messageIds)) {
    const newMessages = visibleMessages.slice(renderedMessageIds.length);
    if (newMessages.length > 0) {
      stack.insertAdjacentHTML("beforeend", newMessages.map(renderChatMessage).join(""));
    }
  } else {
    stack.innerHTML = visibleMessages.map(renderChatMessage).join("");
  }

  renderedMessageIds = messageIds;

  if (shouldFollow) {
    scrollChatToBottom();
  } else {
    // Restore position relative to bottom so new messages appended below don't shift the view
    el.chatFeed.scrollTop = el.chatFeed.scrollHeight - scrollBottom;
    updateJumpToLive();
  }
}

function getChatStack() {
  let stack = el.chatFeed.querySelector(".v2-chat-stack");
  if (!stack) {
    el.chatFeed.innerHTML = `<div class="v2-chat-stack"></div>`;
    stack = el.chatFeed.querySelector(".v2-chat-stack");
  }
  return stack;
}

function canAppendMessages(messageIds) {
  return (
    renderedMessageIds.length <= messageIds.length &&
    renderedMessageIds.every((id, i) => id === messageIds[i])
  );
}

const PLATFORM_ICONS = {
  twitch: `<svg class="v2-channel-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>`,
  kick: `<img class="v2-channel-icon-svg" src="/assets/kick-logo.png" alt="" aria-hidden="true" />`,
  x: `<svg class="v2-channel-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  room: `<svg class="v2-channel-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`,
};

function renderChatMessage(message) {
  const emoteMap = message.platform === "twitch"
    ? (state.twitchEmotes[message.sourceId] || {})
    : {};

  const channelLabel = message.sourceHandle || message.sourceLabel || message.sourceName || message.platform;
  const icon = PLATFORM_ICONS[message.platform] || PLATFORM_ICONS.room;

  return `
    <div class="v2-chat-msg"><span class="v2-chat-msg-time">${formatTime(message.timestamp)}</span><span class="v2-chat-channel-icon ${message.platform}" title="${escapeHtml(channelLabel)}">${icon}<span class="v2-channel-name">${escapeHtml(channelLabel)}</span></span> <span class="v2-chat-msg-author ${message.platform}" title="${escapeHtml(message.author)}">${escapeHtml(message.author)}</span><span class="v2-chat-msg-colon">: </span>${renderMessageBody(message, emoteMap)}</div>
  `;
}

// ── Scroll helpers ────────────────────────────────────────────────────────────

function scrollChatToBottom() {
  if (queuedScrollFrame) window.cancelAnimationFrame(queuedScrollFrame);
  queuedScrollFrame = window.requestAnimationFrame(() => {
    queuedScrollFrame = 0;
    el.chatFeed.scrollTop = el.chatFeed.scrollHeight;
    updateJumpToLive();
  });
}

function isChatAtBottom() {
  return (
    el.chatFeed.scrollHeight - el.chatFeed.clientHeight - el.chatFeed.scrollTop <=
    CHAT_BOTTOM_THRESHOLD_PX
  );
}

function updateJumpToLive() {
  el.jumpToLive.hidden = state.followingChat;
}

// ── Events ────────────────────────────────────────────────────────────────────

function bindEvents() {
  el.chatFeed.addEventListener("pointerover", (e) => {
    if (e.target.closest(".v2-chat-msg")) state.inspectingProfile = true;
  });

  el.chatFeed.addEventListener("pointerout", () => {
    window.setTimeout(() => {
      const was = state.inspectingProfile;
      state.inspectingProfile = el.chatFeed.matches(":hover");
      if (was && !state.inspectingProfile && state.pendingChatRender) queueRender();
    }, 0);
  });

  el.chatFeed.addEventListener("scroll", () => {
    state.followingChat = isChatAtBottom();
    updateJumpToLive();
  }, { passive: true });

  el.jumpToLive.addEventListener("click", () => {
    state.followingChat = true;
    updateJumpToLive();
    scrollChatToBottom();
  });

  el.expandBtn?.addEventListener("click", () => {
    const expanded = el.streamPanel.classList.toggle("v2-expanded");
    el.expandIcon.style.display  = expanded ? "none"  : "";
    el.collapseIcon.style.display = expanded ? ""     : "none";
    el.expandBtn.title = expanded ? "Collapse player" : "Expand player";
    el.expandBtn.setAttribute("aria-label", el.expandBtn.title);
  });
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
