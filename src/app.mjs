import {
  mergeMessages,
  normalizeMessage,
} from "./chat-model.mjs";
import { createChatRenderer } from "./chat-renderer.mjs";
import {
  loadPublicConfig,
  loadTwitchEmotes,
  refreshLiveState,
  startBackendChatEvents,
  startTwitchConnectors,
} from "./chat-runtime.mjs";
import { fallbackSources } from "./client-sources.mjs";
import { seedDemoMessages, startDemoChat } from "./demo-chat.mjs";
import { PLATFORM_ORDER, getProfileUrl } from "./platforms.mjs";
import { initStreamPlayer } from "./viewer-stream.mjs";

const LIVE_STATE_REFRESH_MS = 30_000;
const CHAT_RENDER_INTERVAL_MS = 80;

let connectedSources = fallbackSources.map((source) => ({ ...source }));
let sourceById = buildSourceMap(connectedSources);
let lastRenderAt = 0;
let queuedRenderFrame = 0;
let queuedRenderTimer = 0;
let knownMessageIds = new Set();
let authorProfilesByKey = new Map();

const state = {
  followingChat: true,
  inspectingProfile: false,
  messages: [],
  pendingChatRender: false,
  queueRender,
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

const renderer = createChatRenderer({
  elements,
  getAuthorProfile,
  getTwitchEmoteMap,
  state,
  window,
});

bindEvents();
await initializeApp();
window.setInterval(refreshLiveStateFromBackend, LIVE_STATE_REFRESH_MS);

async function initializeApp() {
  connectedSources = await loadPublicConfig({ fallbackSources });
  sourceById = buildSourceMap(connectedSources);
  state.sources = connectedSources.map((source) => ({ ...source }));
  state.twitchStatuses = Object.fromEntries(
    connectedSources
      .filter((source) => source.platform === "twitch")
      .map((source) => [source.sourceId, "connecting"]),
  );

  setMessages(isDemoChatEnabled() ? seedDemoMessages({ hasSource, buildSourceMessage }) : []);
  renderer.render();
  initStreamPlayer({ document, sources: connectedSources, window });
  loadTwitchEmotes({ sources: connectedSources, state, queueRender });
  startTwitchConnectors({ sources: connectedSources, state, addMessage, queueRender });
  startBackendChatEvents({ window, addBackendMessage });
  if (isDemoChatEnabled()) {
    startDemoChat({
      addMessage,
      buildConfiguredMessage,
      hasSource,
      isInspectingProfile: () => state.inspectingProfile,
      queueRender,
      window,
    });
  }
  refreshLiveStateFromBackend();
}

function isDemoChatEnabled() {
  const searchParams = new URLSearchParams(window.location.search);
  return ["1", "true"].includes(String(searchParams.get("demoChat") || "").toLowerCase());
}

function refreshLiveStateFromBackend() {
  return refreshLiveState({ state, queueRender });
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
    window.setTimeout(renderer.updateInspectingState, 0);
  });

  elements.chatFeed.addEventListener("scroll", renderer.handleChatScroll, { passive: true });

  elements.jumpToLive.addEventListener("click", () => {
    state.followingChat = true;
    renderer.updateJumpToLive();
    renderer.scrollChatToBottom();
  });
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

function getTwitchEmoteMap(message) {
  if (message.platform !== "twitch") {
    return {};
  }

  return state.twitchEmotes[message.sourceId] || {};
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
  lastRenderAt = window.performance.now();
  renderer.render();
}
