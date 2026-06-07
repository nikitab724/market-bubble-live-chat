import {
  buildPlatformStats,
  buildViewerSummary,
  mergeMessages,
  normalizeMessage,
} from "./chat-model.mjs";
import { renderMessageBody } from "./emote-renderer.mjs";
import { connectTwitchChat } from "./twitch-connector.mjs";

// ── Stream tab configuration ──────────────────────────────────────────────────
//
// Edit this array to match your actual source IDs from /api/public-config.
// "both" is always appended automatically as the "show all" tab.
//
// twitchChannel: the channel embedded in the player for that tab.
//                Set to null to keep the currently embedded channel.
// sourceIds:     filter messages and viewer stats to these source IDs only.
//                Leave empty to include all sources.

const STREAMS = [
  {
    id: "ansem",
    label: "Ansem",
    twitchChannel: "stableronaldo",
    sourceIds: ["twitch-stableronaldo"],
  },
  {
    id: "banks",
    label: "Banks",
    twitchChannel: null,
    sourceIds: ["x-banks"],
  },
];

const BOTH_TAB = { id: "both", label: "Both", twitchChannel: null, sourceIds: [] };
const ALL_TABS = [...STREAMS, BOTH_TAB];

// ── Constants ─────────────────────────────────────────────────────────────────

const LIVE_STATE_REFRESH_MS = 30_000;
const CHAT_RENDER_INTERVAL_MS = 80;
const CHAT_BOTTOM_THRESHOLD_PX = 8;
const MSG_PER_MIN_WINDOW_MS = 60_000;
const PLATFORM_ORDER = ["twitch", "kick", "x", "room"];
const PLATFORM_LABELS = { twitch: "Twitch", kick: "Kick", x: "X", room: "MB.com" };

// ── Fallback sources (used if API is unreachable) ─────────────────────────────

const fallbackSources = [
  {
    sourceId: "twitch-stableronaldo",
    platform: "twitch",
    sourceName: "Ansem",
    sourceHandle: "stableronaldo",
    sourceUrl: "https://twitch.tv/stableronaldo",
    viewerCount: 0,
  },
  {
    sourceId: "x-banks",
    platform: "x",
    sourceName: "Banks",
    sourceHandle: "banks",
    sourceUrl: "https://x.com/banks",
    viewerCount: 0,
  },
];

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
  activeTabId: ALL_TABS[0].id,
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
};

// ── Boot ──────────────────────────────────────────────────────────────────────

bindEvents();
renderTabs();
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

  render();
  initTwitchPlayer();
  loadTwitchEmotes();
  startTwitchConnectors();
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

  const twitchChannel = channel || getActiveTab()?.twitchChannel
    || connectedSources.find((s) => s.platform === "twitch")?.sourceHandle;

  if (!twitchChannel) return;

  const parent = window.location.hostname || "localhost";
  const iframe = document.createElement("iframe");
  iframe.src = `https://player.twitch.tv/?channel=${encodeURIComponent(twitchChannel)}&parent=${encodeURIComponent(parent)}&autoplay=true`;
  iframe.allowFullscreen = true;
  iframe.allow = "autoplay; fullscreen";
  iframe.title = `${twitchChannel} on Twitch`;

  el.twitchPlayer.replaceChildren(iframe);

  const twitchSource = connectedSources.find(
    (s) => s.platform === "twitch" && s.sourceHandle === twitchChannel,
  ) || connectedSources.find((s) => s.platform === "twitch");

  if (twitchSource) {
    el.streamerName.textContent = twitchSource.sourceLabel || twitchSource.sourceName || twitchChannel;
    el.streamerAvatar.textContent = (twitchSource.sourceLabel || twitchChannel).charAt(0).toUpperCase();
    el.followBtn.href = `https://twitch.tv/${twitchChannel}`;
    el.subscribeBtn.href = `https://twitch.tv/subs/${twitchChannel}`;
  }
}

// ── Connectors ────────────────────────────────────────────────────────────────

function startTwitchConnectors() {
  for (const source of connectedSources.filter((s) => s.platform === "twitch")) {
    connectTwitchChat(source.sourceHandle, {
      source,
      onMessage: addMessage,
      onStatus(status) {
        state.twitchStatuses[source.sourceId] = status;
        queueRender();
      },
    });
  }
}

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

function updateStreamHeader() {
  const tab = getActiveTab();
  const tabSources = getTabSources(tab);
  const liveSources = tabSources.filter((s) => s.isLive);
  const primaryLive = liveSources[0];

  if (primaryLive) {
    el.liveBadge.textContent = "Live";
    el.liveBadge.dataset.state = "live";
    if (primaryLive.streamTitle) el.streamTitle.textContent = primaryLive.streamTitle;
  } else {
    el.liveBadge.textContent = "Offline";
    el.liveBadge.dataset.state = "offline";
  }
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
  const prevScroll = el.chatFeed.scrollTop;

  if (state.inspectingProfile) {
    state.pendingChatRender = true;
    updateJumpToLive();
    return;
  }

  state.pendingChatRender = false;

  const messageIds = messages.map((m) => m.id);
  const stack = getChatStack();

  if (canAppendMessages(messageIds)) {
    const newMessages = messages.slice(renderedMessageIds.length);
    if (newMessages.length > 0) {
      stack.insertAdjacentHTML("beforeend", newMessages.map(renderChatMessage).join(""));
    }
  } else {
    stack.innerHTML = messages.map(renderChatMessage).join("");
  }

  renderedMessageIds = messageIds;

  if (shouldFollow) {
    scrollChatToBottom();
  } else {
    el.chatFeed.scrollTop = prevScroll;
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

function renderChatMessage(message) {
  const emoteMap = message.platform === "twitch"
    ? (state.twitchEmotes[message.sourceId] || {})
    : {};

  return `
    <div class="v2-chat-msg">
      <span class="v2-chat-msg-time">${formatTime(message.timestamp)}</span>
      <div class="v2-chat-msg-right">
        <div class="v2-chat-msg-author ${message.platform}" title="${escapeHtml(message.author)}">${escapeHtml(message.author)}</div>
        <div class="v2-chat-msg-body">${renderMessageBody(message, emoteMap)}</div>
      </div>
    </div>
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
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
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
