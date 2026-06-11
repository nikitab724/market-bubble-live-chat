import {
  mergeMessages,
  normalizeMessage,
} from "./chat-model.mjs";
import { createChatRenderer } from "./chat-renderer.mjs";
import {
  loadPublicConfig,
  loadTwitchBadges,
  loadTwitchEmotes,
  loadXProfiles,
  refreshLiveState,
  startBackendChatEvents,
} from "./chat-runtime.mjs";
import { fallbackSources } from "./client-sources.mjs";
import { seedDemoMessages, startDemoChat } from "./demo-chat.mjs";
import { PLATFORM_ORDER, getProfileUrl } from "./platforms.mjs";
import { initStreamPlayer, updateStreamPresence } from "./viewer-stream.mjs";

const LIVE_STATE_REFRESH_MS = 30_000;
const CHAT_RENDER_INTERVAL_MS = 80;
const CHAT_FILTER_STORAGE_KEY = "market-bubble-hidden-chat-sources";

let mountedLiveApp = null;

export function mountLiveApp({ document: documentRef = document, window: windowRef = window } = {}) {
  if (mountedLiveApp) {
    return mountedLiveApp;
  }

  mountedLiveApp = createLiveApp({ document: documentRef, window: windowRef }).mount();
  return mountedLiveApp;
}

function createLiveApp({ document, window }) {
  let connectedSources = fallbackSources.map((source) => ({ ...source }));
  let sourceById = buildSourceMap(connectedSources);
  let lastRenderAt = 0;
  let queuedRenderFrame = 0;
  let queuedRenderTimer = 0;
  let knownMessageIds = new Set();
  let authorProfilesByKey = new Map();

  const state = {
    chatFilterMenuOpen: false,
    disabledChatSourceIds: loadInitialDisabledChatSourceIds(window),
    followingChat: true,
    inspectingProfile: false,
    messages: [],
    pendingChatRender: false,
    pinnedProfileMessageId: "",
    queueRender,
    sources: [],
    twitchBadges: {},
    twitchEmotes: {},
    twitchStatuses: {},
    xProfiles: {},
  };

  const elements = {
    chatFeed: document.querySelector("#chatFeed"),
    chatFilters: document.querySelector("#chatFilters"),
    chatView: document.querySelector(".chat-view"),
    jumpToLive: document.querySelector("#jumpToLive"),
    sourceBreakdown: document.querySelector("#sourceBreakdown"),
    viewerCount: document.querySelector("#viewerCount"),
  };

  const renderer = createChatRenderer({
    elements,
    getAuthorProfile,
    getTwitchBadgeMap,
    getTwitchEmoteMap,
    state,
    window,
  });

  return { mount };

  async function mount() {
    bindEvents();
    await initializeApp();
    window.setInterval(refreshLiveStateFromBackend, LIVE_STATE_REFRESH_MS);
  }

  async function initializeApp() {
    connectedSources = await loadPublicConfig({ fallbackSources });
    sourceById = buildSourceMap(connectedSources);
    state.sources = connectedSources.map((source) => ({ ...source }));
    state.twitchStatuses = Object.fromEntries(
      connectedSources
        .filter((source) => source.platform === "twitch")
        .map((source) => [source.sourceId, "connecting"]),
    );

    setMessages(isDemoChatEnabled() ? seedDemoMessages({ sources: connectedSources, buildSourceMessage }) : []);
    renderer.render();
    initStreamPlayer({ document, sources: connectedSources, window });
    loadTwitchBadges({ sources: connectedSources, state, queueRender });
    loadTwitchEmotes({ sources: connectedSources, state, queueRender });
    loadXProfiles({ sources: connectedSources, state, queueRender });
    startBackendChatEvents({ window, addBackendMessage, updateBackendChatStatus });
    if (isDemoChatEnabled()) {
      startDemoChat({
        addMessage,
        buildConfiguredMessage,
        isInspectingProfile: () => state.inspectingProfile,
        queueRender,
        sources: connectedSources,
        window,
      });
    }
    refreshLiveStateFromBackend();
  }

  function isDemoChatEnabled() {
    const searchParams = new URLSearchParams(window.location.search);
    return ["1", "true"].includes(String(searchParams.get("demoChat") || "").toLowerCase());
  }

  async function refreshLiveStateFromBackend() {
    await refreshLiveState({ state, queueRender });
    // Live-state merges isLive into state.sources; swap the player between
    // the embed and the offline countdown when the answer changes.
    updateStreamPresence({ document, window, sources: state.sources });
  }

  function addBackendMessage(rawMessage) {
    addMessage(rawMessage);
  }

  function updateBackendChatStatus(rawStatus) {
    const sourceId = String(rawStatus?.sourceId || "");
    if (rawStatus?.platform !== "twitch" || !sourceId || !hasSource(sourceId)) {
      return;
    }

    state.twitchStatuses[sourceId] = String(rawStatus.status || "connecting");
    queueRender();
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
      if (state.pinnedProfileMessageId) return;
      if (isBadgeHoverTarget(event)) {
        state.inspectingProfile = false;
        return;
      }

      const message = event.target.closest(".chat-message");
      if (message) {
        state.inspectingProfile = true;
        renderer.positionProfileCard(message);
      }
    });

    elements.chatFeed.addEventListener("pointermove", (event) => {
      if (state.pinnedProfileMessageId) return;
      if (isBadgeHoverTarget(event)) {
        state.inspectingProfile = false;
        return;
      }

      const message = event.target.closest(".chat-message");
      if (message) {
        renderer.positionProfileCard(message);
      }
    });

    elements.chatFeed.addEventListener("pointerout", () => {
      window.setTimeout(renderer.updateInspectingState, 0);
    });

    elements.chatView.addEventListener("wheel", renderer.handleChatWheel, { capture: true, passive: false });
    elements.chatView.addEventListener("touchstart", renderer.handleChatTouchStart, { capture: true, passive: true });
    elements.chatView.addEventListener("touchmove", renderer.handleChatTouchMove, { capture: true, passive: false });
    elements.chatFilters.addEventListener("click", handleChatFilterToggle);
    elements.chatFeed.addEventListener("click", handleProfilePinClick);
    document.addEventListener("click", handleDocumentProfileUnpinClick);
    document.addEventListener("click", handleDocumentChatFilterMenuClose);
    document.addEventListener("keydown", handleChatFilterMenuEscape);

    elements.jumpToLive.addEventListener("click", () => {
      clearPinnedProfileCard({ syncScroll: false });
      state.followingChat = true;
      state.inspectingProfile = false;
      renderer.renderPendingChat();
    });
  }

  function handleChatFilterToggle(event) {
    const target = event.target instanceof Element ? event.target : null;

    if (target?.closest(".chat-filter-button")) {
      state.chatFilterMenuOpen = !state.chatFilterMenuOpen;
      renderer.render();
      return;
    }

    const button = target?.closest(".chat-filter-toggle");
    const sourceId = String(button?.dataset.sourceId || "");
    if (!button || !hasSource(sourceId)) {
      return;
    }

    clearPinnedProfileCard({ syncScroll: false });
    state.inspectingProfile = false;
    state.followingChat = true;

    if (state.disabledChatSourceIds.has(sourceId)) {
      state.disabledChatSourceIds.delete(sourceId);
    } else {
      state.disabledChatSourceIds.add(sourceId);
    }

    persistDisabledChatSourceIds();
    renderer.render();
  }

  function handleDocumentChatFilterMenuClose(event) {
    if (!state.chatFilterMenuOpen) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    // A click handled inside the filter UI re-renders it, detaching the
    // original target; only clicks on connected outside elements close it.
    if (!target || !target.isConnected || target.closest(".chat-filters")) {
      return;
    }

    state.chatFilterMenuOpen = false;
    renderer.render();
  }

  function handleChatFilterMenuEscape(event) {
    if (event.key !== "Escape" || !state.chatFilterMenuOpen) {
      return;
    }

    state.chatFilterMenuOpen = false;
    renderer.render();
  }

  function loadInitialDisabledChatSourceIds(window) {
    try {
      const hidden = String(new URLSearchParams(window.location.search).get("hide") || "")
        .split(",")
        .map((sourceId) => sourceId.trim())
        .filter(Boolean);
      if (hidden.length > 0) {
        return new Set(hidden);
      }

      const stored = JSON.parse(window.localStorage.getItem(CHAT_FILTER_STORAGE_KEY) || "[]");
      return new Set(Array.isArray(stored) ? stored.map(String) : []);
    } catch {
      return new Set();
    }
  }

  function persistDisabledChatSourceIds() {
    try {
      window.localStorage.setItem(CHAT_FILTER_STORAGE_KEY, JSON.stringify([...state.disabledChatSourceIds]));
    } catch {
      // storage unavailable (private mode, embedded overlay)
    }
  }

  function handleProfilePinClick(event) {
    if (event.target.closest(".profile-card a")) {
      event.stopPropagation();
      return;
    }

    if (isBadgeHoverTarget(event)) {
      return;
    }

    const message = event.target.closest(".chat-message");
    if (!message) {
      return;
    }

    clearPinnedProfileCard({ syncScroll: false });
    state.pinnedProfileMessageId = message.dataset.messageId || "";
    state.inspectingProfile = true;
    state.followingChat = false;
    message.classList.add("is-profile-pinned");
    elements.chatFeed.classList.add("has-profile-pin");
    renderer.positionProfileCard(message);
    renderer.updateJumpToLive();
  }

  function handleDocumentProfileUnpinClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(".chat-message")) {
      return;
    }

    clearPinnedProfileCard();
  }

  function clearPinnedProfileCard({ syncScroll = true } = {}) {
    const pinnedMessage = elements.chatFeed.querySelector(".chat-message.is-profile-pinned");
    if (pinnedMessage) {
      pinnedMessage.classList.remove("is-profile-pinned");
    }

    state.pinnedProfileMessageId = "";
    state.inspectingProfile = false;
    elements.chatFeed.classList.remove("has-profile-pin");

    if (syncScroll) {
      renderer.handleChatScroll();
    }
  }

  function isBadgeHoverTarget(event) {
    const target = event.target instanceof Element ? event.target : null;
    return Boolean(target && target.closest(".chat-badge"));
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
    if (!["twitch", "kick"].includes(message.platform)) {
      return {};
    }

    return state.twitchEmotes[message.sourceId] || {};
  }

  function getTwitchBadgeMap(message) {
    if (message.platform !== "twitch") {
      return {};
    }

    return state.twitchBadges[message.sourceId] || {};
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
}
