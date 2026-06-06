import {
  buildAuthorProfile,
  buildViewerSummary,
  mergeMessages,
  normalizeMessage,
} from "./chat-model.mjs";
import { renderMessageBody } from "./emote-renderer.mjs";
import { connectTwitchChat } from "./twitch-connector.mjs";

const platformMeta = {
  twitch: {
    label: "Twitch",
    source: "https://twitch.tv/marketbubble",
  },
  kick: {
    label: "Kick",
    source: "https://kick.com/marketbubble",
  },
  x: {
    label: "X",
    source: "https://x.com/MarketBubble",
  },
  room: {
    label: "MB.com",
    source: "https://marketbubble.com",
  },
};

const LIVE_STATE_REFRESH_MS = 30_000;
const CHAT_RENDER_INTERVAL_MS = 80;
const CHAT_BOTTOM_THRESHOLD_PX = 8;

const fallbackSources = [
  {
    sourceId: "twitch-marketbubble",
    platform: "twitch",
    sourceName: "Market Bubble",
    sourceHandle: "marketbubble",
    sourceUrl: "https://twitch.tv/marketbubble",
    viewerCount: 3184,
  },
  {
    sourceId: "kick-marketbubble",
    platform: "kick",
    sourceName: "Market Bubble",
    sourceHandle: "marketbubble",
    sourceUrl: "https://kick.com/marketbubble",
    viewerCount: 1260,
  },
  {
    sourceId: "x-banks",
    platform: "x",
    sourceName: "Banks",
    sourceHandle: "Banks",
    sourceUrl: "https://x.com/Banks",
    viewerCount: 8062,
  },
  {
    sourceId: "x-z",
    platform: "x",
    sourceName: "Z",
    sourceHandle: "z",
    sourceUrl: "https://x.com/z",
    viewerCount: 4720,
  },
  {
    sourceId: "room-marketbubble",
    platform: "room",
    sourceName: "MarketBubble.com",
    sourceHandle: "marketbubble",
    sourceUrl: "https://marketbubble.com",
    viewerCount: 518,
  },
];

let connectedSources = fallbackSources.map((source) => ({ ...source }));
let sourceById = buildSourceMap(connectedSources);
let lastRenderAt = 0;
let queuedRenderFrame = 0;
let queuedRenderTimer = 0;
let queuedScrollFrame = 0;

const scriptedMessages = [
  ["twitch-marketbubble", "TapeReader", "tape-reader", "Twitch chat finally in one place would be insane", -118],
  ["kick-marketbubble", "RiskOnRiley", "riskon", "Kick chat moving faster than the candles", -109],
  ["x-banks", "MacroMax", "macromax", "Banks X stream should sit beside chat imo", -101],
  ["x-z", "VolatilitySmile", "volsmile", "Z stream replies are pulling in too", -92],
  ["twitch-marketbubble", "ChartLad", "chartlad", "Banks is cooking with this challenge", -82],
  ["kick-marketbubble", "EVHunter", "evhunter", "source labels are the whole point", -74],
  ["room-marketbubble", "DeskSeat", "deskseat", "native marketbubble.com chat is clean", -66],
  ["x-banks", "Quoter", "quoteflow", "X comments need their own source label", -54],
  ["x-z", "ZedFlow", "zedflow", "Z side is live in the same room", -43],
  ["twitch-marketbubble", "OrderbookOli", "oli", "just stream plus combined chat", -37],
  ["kick-marketbubble", "GreenCandle", "greencandle", "simple is better here", -29],
  ["room-marketbubble", "Nikita", "nikita", "okay this makes way more sense now", -16],
];

// Twitch and Kick entries removed — real messages come from backend connectors now.
const livePool = [
  ["x-banks", "CryptoJack", "cryptojack", "Banks X comment showing beside stream chat"],
  ["x-z", "ZedFlow", "zedflow", "Z X stream reply just hit"],
  ["room-marketbubble", "DeskSeat", "deskseat", "native chat feels better here"],
  ["x-banks", "PMFSeeker", "pmfseeker", "ship the simple demo link"],
];

const state = {
  followingChat: true,
  inspectingProfile: false,
  messages: [],
  sources: [],
  twitchEmotes: {},
  twitchStatuses: {},
};

const elements = {
  chatFeed: document.querySelector("#chatFeed"),
  jumpToLive: document.querySelector("#jumpToLive"),
  sourceBreakdown: document.querySelector("#sourceBreakdown"),
  viewerCount: document.querySelector("#viewerCount"),
};

bindEvents();
await initializeApp();

window.setInterval(refreshLiveState, LIVE_STATE_REFRESH_MS);

window.setInterval(() => {
  if (state.inspectingProfile) {
    return;
  }

  pushLiveMessage();
  queueRender();
}, 2800);

async function initializeApp() {
  connectedSources = await loadPublicConfig();
  sourceById = buildSourceMap(connectedSources);
  state.sources = connectedSources.map((source) => ({ ...source }));
  state.twitchStatuses = Object.fromEntries(
    connectedSources
      .filter((source) => source.platform === "twitch")
      .map((source) => [source.sourceId, "connecting"]),
  );
  state.messages = seedMessages();
  render();
  initTwitchPlayer();
  loadTwitchEmotes();
  startTwitchConnectors();
  startBackendChatEvents();
  refreshLiveState();
}

async function loadPublicConfig() {
  try {
    const response = await fetch("/api/public-config", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Config request failed");
    }

    const config = await response.json();
    if (Array.isArray(config.sources) && config.sources.length > 0) {
      return config.sources;
    }
  } catch {
    return fallbackSources.map((source) => ({ ...source }));
  }

  return fallbackSources.map((source) => ({ ...source }));
}

function initTwitchPlayer() {
  const playerEl = document.querySelector("#twitchPlayer");
  if (!playerEl) return;

  const twitchSource = connectedSources.find((s) => s.platform === "twitch");
  if (!twitchSource) return;

  const parent = window.location.hostname || "localhost";
  const iframe = document.createElement("iframe");
  iframe.src = `https://player.twitch.tv/?channel=${encodeURIComponent(twitchSource.sourceHandle)}&parent=${encodeURIComponent(parent)}&autoplay=true`;
  iframe.allowFullscreen = true;
  iframe.allow = "autoplay; fullscreen";
  iframe.title = `${twitchSource.sourceName} on Twitch`;

  playerEl.replaceChildren();
  playerEl.appendChild(iframe);
}

function startTwitchConnectors() {
  const twitchSources = connectedSources.filter((source) => source.platform === "twitch");

  for (const twitchSource of twitchSources) {
    connectTwitchChat(twitchSource.sourceHandle, {
      source: twitchSource,
      onMessage(rawMessage) {
        state.messages = mergeMessages([
          ...state.messages,
          normalizeMessage(rawMessage),
        ]);
        queueRender();
      },
      onStatus(status) {
        state.twitchStatuses[twitchSource.sourceId] = status;
        queueRender();
      },
    });
  }
}

async function loadTwitchEmotes() {
  const twitchSources = connectedSources.filter((source) => source.platform === "twitch");

  await Promise.all(
    twitchSources.map(async (source) => {
      try {
        const response = await fetch(`/api/twitch-emotes?channel=${encodeURIComponent(source.sourceHandle)}`, {
          cache: "no-store",
        });
        if (!response.ok) return;

        const payload = await response.json();
        state.twitchEmotes[source.sourceId] = payload.emotes || {};
        queueRender();
      } catch {
        // Text chat still works if a third-party emote provider is unavailable.
      }
    }),
  );
}

function startBackendChatEvents() {
  if (!("EventSource" in window)) return;

  const events = new EventSource("/api/chat-events");
  events.addEventListener("chat", (event) => {
    addBackendMessage(JSON.parse(event.data));
  });
}

function addBackendMessage(rawMessage) {
  state.messages = mergeMessages([
    ...state.messages,
    normalizeMessage(rawMessage),
  ]);
  queueRender();
}

function buildSourceMap(sources) {
  return new Map(sources.map((source) => [source.sourceId, source]));
}

function hasSource(sourceId) {
  return sourceById.has(sourceId);
}

function getSimulatedLivePool() {
  return livePool.filter(([sourceId]) => hasSource(sourceId));
}

function getScriptedMessages() {
  return scriptedMessages.filter(([sourceId]) => hasSource(sourceId));
}

function getSource(sourceId) {
  const source = sourceById.get(sourceId);

  if (!source) {
    throw new Error(`Unknown source: ${sourceId}`);
  }

  return source;
}

function buildConfiguredMessage(sourceId, author, handle, body, timestamp) {
  return normalizeMessage({
    ...buildSourceMessage(sourceId, author, handle, body, timestamp),
  });
}

function bindEvents() {
  elements.chatFeed.addEventListener("pointerover", (event) => {
    if (event.target.closest(".chat-message")) {
      state.inspectingProfile = true;
    }
  });

  elements.chatFeed.addEventListener("pointerout", () => {
    window.setTimeout(updateInspectingState, 0);
  });

  elements.chatFeed.addEventListener("scroll", handleChatScroll, { passive: true });

  elements.jumpToLive.addEventListener("click", () => {
    state.followingChat = true;
    updateJumpToLive();
    scrollChatToBottom();
  });
}

function seedMessages() {
  const now = Date.now();

  return mergeMessages(
    getScriptedMessages().map(([sourceId, author, handle, body, secondsAgo]) =>
      buildSourceMessage(sourceId, author, handle, body, new Date(now + secondsAgo * 1000).toISOString()),
    ),
  );
}

function pushLiveMessage() {
  const availableMessages = getSimulatedLivePool();
  if (availableMessages.length === 0) {
    return;
  }

  const [sourceId, author, handle, body] = availableMessages[Math.floor(Math.random() * availableMessages.length)];

  state.messages = mergeMessages([
    ...state.messages,
    buildConfiguredMessage(sourceId, author, handle, body, new Date().toISOString()),
  ]);
}

function buildSourceMessage(sourceId, author, handle, body, timestamp) {
  const source = getSource(sourceId);

  return {
    platform: source.platform,
    author,
    handle,
    body,
    timestamp,
    sourceUrl: getProfileUrl(source.platform, handle),
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    sourceHandle: source.sourceHandle,
    sourceLabel: source.sourceLabel || source.sourceName,
  };
}

async function refreshLiveState() {
  try {
    const response = await fetch("/api/live-state", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Live state request failed");
    }

    const liveState = await response.json();
    if (!Array.isArray(liveState.sources) || liveState.sources.length === 0) {
      return;
    }

    const liveSourceById = new Map(liveState.sources.map((source) => [source.sourceId, source]));
    state.sources = state.sources.map((source) => {
      const liveSource = liveSourceById.get(source.sourceId);
      if (!liveSource) {
        return source;
      }

      return {
        ...source,
        gameName: liveSource.gameName || "",
        isLive: liveSource.isLive === true,
        startedAt: liveSource.startedAt || "",
        streamTitle: liveSource.title || "",
        thumbnailUrl: liveSource.thumbnailUrl || "",
        viewerCount: Number(liveSource.viewerCount || 0),
        viewerCountLocked: true,
      };
    });
    queueRender();
  } catch {
    // Keep configured or simulated values when live providers are unavailable.
  }
}

function queueRender() {
  if (queuedRenderFrame || queuedRenderTimer) {
    return;
  }

  const elapsed = window.performance.now() - lastRenderAt;
  const delay = Math.max(0, CHAT_RENDER_INTERVAL_MS - elapsed);

  queuedRenderTimer = window.setTimeout(() => {
    queuedRenderTimer = 0;
    queuedRenderFrame = window.requestAnimationFrame(flushQueuedRender);
  }, delay);
}

function flushQueuedRender() {
  queuedRenderFrame = 0;
  render();
}

function render() {
  lastRenderAt = window.performance.now();
  const shouldFollowChat = state.followingChat;
  const previousScrollTop = elements.chatFeed.scrollTop;
  const viewerSummary = buildViewerSummary(state.sources);

  elements.viewerCount.textContent = formatNumber(viewerSummary.total);
  elements.sourceBreakdown.innerHTML = viewerSummary.sources.map(renderSource).join("");
  elements.chatFeed.innerHTML = `<div class="chat-stack">${state.messages.map(renderMessage).join("")}</div>`;
  if (shouldFollowChat) {
    scrollChatToBottom();
  } else {
    elements.chatFeed.scrollTop = previousScrollTop;
    updateJumpToLive();
  }
}

function scrollChatToBottom() {
  if (queuedScrollFrame) {
    window.cancelAnimationFrame(queuedScrollFrame);
  }

  queuedScrollFrame = window.requestAnimationFrame(() => {
    queuedScrollFrame = 0;
    elements.chatFeed.scrollTop = elements.chatFeed.scrollHeight;
    updateJumpToLive();
  });
}

function handleChatScroll() {
  if (isChatAtBottom()) {
    state.followingChat = true;
  } else {
    state.followingChat = false;
  }

  updateJumpToLive();
}

function isChatAtBottom() {
  return elements.chatFeed.scrollHeight - elements.chatFeed.clientHeight - elements.chatFeed.scrollTop <= CHAT_BOTTOM_THRESHOLD_PX;
}

function updateJumpToLive() {
  elements.jumpToLive.hidden = state.followingChat;
}

function renderSource(source) {
  const meta = platformMeta[source.platform];
  const statusDot = source.platform === "twitch"
    ? renderStatusDot(state.twitchStatuses[source.sourceId] || "connecting")
    : "";
  const chipTitle = getSourceChipTitle(meta, source);

  return `
    <div class="source-chip ${source.platform}" title="${escapeHtml(chipTitle)}">
      <span>${escapeHtml(meta.label)}</span>
      <strong>${escapeHtml(source.sourceLabel)}</strong>
      ${statusDot}
      <b>${formatNumber(source.viewerCount)}</b>
    </div>
  `;
}

function getSourceChipTitle(meta, source) {
  const parts = [`${meta.label} / ${source.sourceLabel}`];

  if (source.viewerCountLocked) {
    parts.push(source.isLive ? "Live" : "Offline");
    if (source.streamTitle) parts.push(source.streamTitle);
    if (source.gameName) parts.push(source.gameName);
  }

  return parts.join(" - ");
}

function renderStatusDot(status) {
  const labels = { connected: "Live", connecting: "Connecting…", disconnected: "Disconnected" };
  return `<em class="live-dot ${status}" title="${labels[status] ?? status}"></em>`;
}

function renderMessage(message) {
  const meta = platformMeta[message.platform];
  const profile = buildAuthorProfile(state.messages, message);

  return `
    <article class="chat-message ${message.platform}">
      <div class="message-body">
        <div class="message-meta">
          <strong title="${escapeHtml(message.author)}">${escapeHtml(message.author)}</strong>
          <span class="platform-badge ${message.platform}">${meta.label}</span>
          <span class="source-label ${message.platform}" title="${escapeHtml(meta.label)} / ${escapeHtml(message.sourceLabel)}">${escapeHtml(message.sourceLabel)}</span>
          <time>${formatTime(message.timestamp)}</time>
        </div>
        <p>${renderMessageBody(message, getTwitchEmoteMap(message))}</p>
      </div>
      <div class="profile-card" role="tooltip">
        <div class="profile-card-header">
          <div>
            <strong>${escapeHtml(profile.author)}</strong>
            <span>${escapeHtml(profile.displayHandle)}</span>
          </div>
        </div>
        <dl>
          <div>
            <dt>Platform</dt>
            <dd>${meta.label}</dd>
          </div>
          <div>
            <dt>Stream</dt>
            <dd>${escapeHtml(profile.sourceLabel)}</dd>
          </div>
          <div>
            <dt>Messages</dt>
            <dd>${profile.messageCount}</dd>
          </div>
          <div>
            <dt>Last seen</dt>
            <dd>${formatTime(profile.lastSeen)}</dd>
          </div>
          <div>
            <dt>Profile</dt>
            <dd><a href="${escapeHtml(profile.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(profile.sourceUrl)}</a></dd>
          </div>
        </dl>
      </div>
    </article>
  `;
}

function getTwitchEmoteMap(message) {
  if (message.platform !== "twitch") {
    return {};
  }

  return state.twitchEmotes[message.sourceId] || {};
}

function updateInspectingState() {
  state.inspectingProfile = elements.chatFeed.matches(":hover");
}

function getProfileUrl(platform, handle) {
  const cleanHandle = String(handle).replace(/^@/, "");

  if (platform === "twitch") {
    return `https://twitch.tv/${cleanHandle}`;
  }

  if (platform === "kick") {
    return `https://kick.com/${cleanHandle}`;
  }

  if (platform === "room") {
    return `https://marketbubble.com/u/${cleanHandle}`;
  }

  return `https://x.com/${cleanHandle}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
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
