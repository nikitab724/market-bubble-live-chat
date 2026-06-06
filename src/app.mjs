import {
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

const PLATFORM_ORDER = Object.keys(platformMeta);
const LIVE_STATE_REFRESH_MS = 30_000;
const CHAT_RENDER_INTERVAL_MS = 80;
const CHAT_BOTTOM_THRESHOLD_PX = 8;
const CHAT_RENDER_WINDOW_SIZE = 500;

const fallbackSources = [
  {
    sourceId: "twitch-marketbubble",
    platform: "twitch",
    sourceName: "Market Bubble",
    sourceHandle: "marketbubble",
    sourceUrl: "https://twitch.tv/marketbubble",
    showStream: true,
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
let renderedMessageIds = [];
let knownMessageIds = new Set();
let authorProfilesByKey = new Map();

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
  pendingChatRender: false,
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
  setMessages(seedMessages());
  render();
  initStreamPlayer();
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

function initStreamPlayer() {
  const playerEl = document.querySelector("#streamPlayer");
  if (!playerEl) return;

  const streamSource = getSelectedStreamSource();
  playerEl.replaceChildren();
  if (!streamSource) {
    renderStreamPlaceholder(playerEl);
    return;
  }

  if (streamSource.platform === "twitch") {
    playerEl.append(createTwitchStreamFrame(streamSource));
    return;
  }

  if (streamSource.platform === "kick") {
    playerEl.append(createKickStreamFrame(streamSource));
    return;
  }

  if (streamSource.platform === "x" && streamSource.conversationId) {
    renderXStreamEmbed(playerEl, streamSource);
    return;
  }

  renderStreamPlaceholder(playerEl, streamSource);
}

function getSelectedStreamSource() {
  return connectedSources.find((source) => source.showStream === true)
    || connectedSources.find((source) => source.platform === "twitch")
    || connectedSources.find((source) => source.platform === "kick")
    || connectedSources[0];
}

function createTwitchStreamFrame(source) {
  const parent = window.location.hostname || "localhost";
  const iframe = document.createElement("iframe");
  iframe.src = `https://player.twitch.tv/?channel=${encodeURIComponent(source.sourceHandle)}&parent=${encodeURIComponent(parent)}&autoplay=true`;
  iframe.allowFullscreen = true;
  iframe.allow = "autoplay; fullscreen; picture-in-picture";
  iframe.title = `${source.sourceName} on Twitch`;
  return iframe;
}

function createKickStreamFrame(source) {
  const iframe = document.createElement("iframe");
  iframe.src = `https://player.kick.com/${encodeURIComponent(source.sourceHandle)}?autoplay=true`;
  iframe.allowFullscreen = true;
  iframe.allow = "autoplay; fullscreen; picture-in-picture";
  iframe.title = `${source.sourceName} on Kick`;
  return iframe;
}

function renderXStreamEmbed(playerEl, source) {
  const post = document.createElement("blockquote");
  post.className = "twitter-tweet";
  post.dataset.theme = "dark";

  const link = document.createElement("a");
  link.href = `https://x.com/${encodeURIComponent(source.sourceHandle)}/status/${encodeURIComponent(source.conversationId)}`;
  link.textContent = `${source.sourceName} on X`;
  post.append(link);
  playerEl.append(post);
  loadXWidgets(playerEl);
}

function loadXWidgets(container) {
  if (window.twttr?.widgets?.load) {
    window.twttr.widgets.load(container);
    return;
  }

  const existingScript = document.querySelector("[data-x-widgets]");
  if (existingScript) return;

  const script = document.createElement("script");
  script.async = true;
  script.charset = "utf-8";
  script.dataset.xWidgets = "true";
  script.src = "https://platform.x.com/widgets.js";
  script.addEventListener("load", () => window.twttr?.widgets?.load(container));
  document.head.append(script);
}

function renderStreamPlaceholder(playerEl, source = null) {
  const platform = source?.platform || "room";
  const meta = platformMeta[platform] || platformMeta.room;
  playerEl.innerHTML = `
    <div class="stream-placeholder ${escapeHtml(platform)}">
      <span>${escapeHtml(meta.label)} stream selected</span>
      <strong>${escapeHtml(source?.sourceLabel || source?.sourceName || "No stream selected")}</strong>
      <p>${source ? "Open the selected livestream source in a new tab." : "Choose a livestream source in the admin panel."}</p>
      ${source?.sourceUrl ? `<a href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noreferrer">Open Stream</a>` : ""}
    </div>
  `;
}

function startTwitchConnectors() {
  const twitchSources = connectedSources.filter((source) => source.platform === "twitch");

  for (const twitchSource of twitchSources) {
    connectTwitchChat(twitchSource.sourceHandle, {
      source: twitchSource,
      onMessage(rawMessage) {
        addMessage(rawMessage);
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
  addMessage(rawMessage);
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

  addMessage(buildConfiguredMessage(sourceId, author, handle, body, new Date().toISOString()));
}

function setMessages(messages) {
  state.messages = mergeMessages(messages);
  knownMessageIds = new Set(state.messages.map((message) => message.id));
  authorProfilesByKey = new Map();
  state.messages.forEach(recordAuthorProfile);
}

function addMessage(rawMessage) {
  const message = normalizeMessage(rawMessage);
  if (knownMessageIds.has(message.id)) {
    return false;
  }

  knownMessageIds.add(message.id);
  const lastMessage = state.messages.at(-1);
  if (!lastMessage || compareMessageOrder(lastMessage, message) <= 0) {
    state.messages.push(message);
  } else {
    state.messages = mergeMessages([...state.messages, message]);
  }

  recordAuthorProfile(message);
  queueRender();
  return true;
}

function recordAuthorProfile(message) {
  const key = getAuthorProfileKey(message);
  const existingProfile = authorProfilesByKey.get(key);
  const nextMessageCount = (existingProfile?.messageCount || 0) + 1;
  const nextLastSeen = !existingProfile || Date.parse(message.timestamp) > Date.parse(existingProfile.lastSeen)
    ? message.timestamp
    : existingProfile.lastSeen;

  authorProfilesByKey.set(key, {
    author: message.author,
    displayHandle: `@${message.handle}`,
    handle: message.handle,
    lastSeen: nextLastSeen,
    messageCount: nextMessageCount,
    platform: message.platform,
  });
}

function getAuthorProfile(message) {
  const profile = authorProfilesByKey.get(getAuthorProfileKey(message));

  return {
    platform: message.platform,
    author: profile?.author || message.author,
    handle: profile?.handle || message.handle,
    displayHandle: profile?.displayHandle || `@${message.handle}`,
    sourceUrl: message.sourceUrl,
    sourceId: message.sourceId,
    sourceName: message.sourceName,
    sourceHandle: message.sourceHandle,
    sourceLabel: message.sourceLabel,
    messageCount: profile?.messageCount || 1,
    lastSeen: profile?.lastSeen || message.timestamp,
  };
}

function getAuthorProfileKey(message) {
  return `${message.platform}:${message.handle.toLowerCase()}`;
}

function compareMessageOrder(left, right) {
  const timeDifference = Date.parse(left.timestamp) - Date.parse(right.timestamp);
  if (timeDifference !== 0) {
    return timeDifference;
  }

  return PLATFORM_ORDER.indexOf(left.platform) - PLATFORM_ORDER.indexOf(right.platform);
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
  const shouldFollowChat = state.followingChat || isChatAtBottom();
  state.followingChat = shouldFollowChat;
  const previousScrollTop = elements.chatFeed.scrollTop;
  const viewerSummary = buildViewerSummary(state.sources);

  elements.viewerCount.textContent = formatNumber(viewerSummary.total);
  elements.sourceBreakdown.innerHTML = viewerSummary.sources.map(renderSource).join("");

  if (state.inspectingProfile) {
    state.pendingChatRender = true;
    updateJumpToLive();
    return;
  }

  state.pendingChatRender = false;
  renderChatFeed(shouldFollowChat, previousScrollTop);
}

function renderChatFeed(shouldFollowChat, previousScrollTop) {
  const visibleMessages = getVisibleMessages();
  const messageIds = visibleMessages.map((message) => message.id);
  const chatStack = getChatStack();

  if (canAppendMessages(messageIds)) {
    const newMessages = visibleMessages.slice(renderedMessageIds.length);
    if (newMessages.length > 0) {
      chatStack.insertAdjacentHTML("beforeend", newMessages.map(renderMessage).join(""));
    }
  } else if (canSlideMessageWindow(messageIds)) {
    const overlapLength = getWindowOverlapLength(renderedMessageIds, messageIds);
    removeStaleRows(chatStack, renderedMessageIds.length - overlapLength);
    const newMessages = visibleMessages.slice(overlapLength);
    if (newMessages.length > 0) {
      chatStack.insertAdjacentHTML("beforeend", newMessages.map(renderMessage).join(""));
    }
  } else {
    chatStack.innerHTML = visibleMessages.map(renderMessage).join("");
  }

  renderedMessageIds = messageIds;

  if (shouldFollowChat) {
    scrollChatToBottom();
  } else {
    elements.chatFeed.scrollTop = previousScrollTop;
    updateJumpToLive();
  }
}

function getVisibleMessages() {
  return state.messages.slice(-CHAT_RENDER_WINDOW_SIZE);
}

function getChatStack() {
  const existingStack = elements.chatFeed.querySelector(".chat-stack");
  if (existingStack) {
    return existingStack;
  }

  elements.chatFeed.innerHTML = `<div class="chat-stack"></div>`;
  return elements.chatFeed.querySelector(".chat-stack");
}

function canAppendMessages(messageIds) {
  return renderedMessageIds.length <= messageIds.length
    && renderedMessageIds.every((id, index) => id === messageIds[index]);
}

function canSlideMessageWindow(messageIds) {
  return getWindowOverlapLength(renderedMessageIds, messageIds) > 0;
}

function getWindowOverlapLength(previousIds, nextIds) {
  const maxOverlap = Math.min(previousIds.length, nextIds.length);
  for (let overlapLength = maxOverlap; overlapLength > 0; overlapLength -= 1) {
    const previousStart = previousIds.length - overlapLength;
    const previousTail = previousIds.slice(previousStart);
    const nextHead = nextIds.slice(0, overlapLength);
    if (previousTail.every((id, index) => id === nextHead[index])) {
      return overlapLength;
    }
  }

  return 0;
}

function removeStaleRows(chatStack, count) {
  for (let index = 0; index < count; index += 1) {
    chatStack.firstElementChild?.remove();
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
  const profile = getAuthorProfile(message);

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
  const wasInspectingProfile = state.inspectingProfile;
  state.inspectingProfile = elements.chatFeed.matches(":hover");

  if (wasInspectingProfile && !state.inspectingProfile && state.pendingChatRender) {
    queueRender();
  }
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
