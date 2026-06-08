import { buildViewerSummary } from "./chat-model.mjs";
import { renderMessageBody } from "./emote-renderer.mjs";
import { PLATFORM_ORDER, escapeHtml, platformMeta } from "./platforms.mjs";

const AUTO_SCROLL_THRESHOLD_PX = 120;
const CHAT_RENDER_WINDOW_SIZE = 500;
const VIEWER_COUNT_EXPONENTIAL_RATE = 18;
const VIEWER_COUNT_MAX_FRAME_MS = 48;

export function createChatRenderer({
  window,
  elements,
  state,
  getAuthorProfile,
  getTwitchBadgeMap = () => ({}),
  getTwitchEmoteMap,
}) {
  let renderedChatFilterKey = "";
  let renderedViewerSummaryKey = "";
  let renderedMessageIds = [];
  let queuedProfileCardFrame = 0;
  let queuedScrollFrame = 0;
  let lastTouchClientY = null;
  const viewerCountAnimations = new Map();

  return {
    handleChatScroll,
    handleChatTouchMove,
    handleChatTouchStart,
    handleChatWheel,
    positionProfileCard,
    render,
    renderPendingChat,
    scrollChatToBottom,
    updateInspectingState,
    updateJumpToLive,
  };

  function render() {
    const shouldFollowChat = state.pinnedProfileMessageId ? false : state.followingChat || isChatNearBottom();
    state.followingChat = shouldFollowChat;

    renderViewerSummary();
    renderChatFilters();

    if (state.pinnedProfileMessageId) {
      state.pendingChatRender = true;
      updateJumpToLive();
      return;
    }

    if (state.inspectingProfile) {
      state.pendingChatRender = true;
      updateJumpToLive();
      return;
    }

    if (shouldPauseChatRender(shouldFollowChat)) {
      state.pendingChatRender = true;
      updateJumpToLive();
      return;
    }

    state.pendingChatRender = false;
    renderChatFeed(shouldFollowChat);
  }

  function renderViewerSummary() {
    const viewerSummary = buildViewerSummary(state.sources);
    const summaryKey = getViewerSummaryKey(viewerSummary);

    if (summaryKey === renderedViewerSummaryKey) {
      return;
    }

    renderedViewerSummaryKey = summaryKey;
    elements.sourceBreakdown.innerHTML = viewerSummary.sources.map(renderSource).join("");
    syncAnimatedViewerCountNode(elements.viewerCount, "total", viewerSummary.total);
    elements.sourceBreakdown
      .querySelectorAll("[data-viewer-count-key]")
      .forEach((node) => {
        syncAnimatedViewerCountNode(node, node.dataset.viewerCountKey, node.dataset.viewerCountTarget);
      });
  }

  function getViewerSummaryKey(viewerSummary) {
    return JSON.stringify({
      sources: viewerSummary.sources.map((source) => ({
        gameName: source.gameName || "",
        isLive: source.isLive === true,
        platform: source.platform,
        profileId: source.profileId || "",
        profileName: source.profileName || "",
        profileSources: getSourceProfile(source).sources.map((profileSource) => ({
          platform: profileSource.platform,
          sourceHandle: profileSource.sourceHandle,
          sourceLabel: profileSource.sourceLabel,
          sourceUrl: profileSource.sourceUrl,
        })),
        sourceId: source.sourceId,
        sourceHandle: source.sourceHandle,
        sourceLabel: source.sourceLabel,
        sourceUrl: source.sourceUrl,
        status: source.platform === "twitch" ? state.twitchStatuses[source.sourceId] || "connecting" : "",
        streamTitle: source.streamTitle || "",
        viewerCount: source.viewerCount,
        viewerCountLocked: source.viewerCountLocked === true,
      })),
      total: viewerSummary.total,
    });
  }

  function renderPendingChat() {
    state.followingChat = true;
    state.pendingChatRender = false;
    renderChatFeed(true);
  }

  function shouldPauseChatRender(shouldFollowChat) {
    return !shouldFollowChat;
  }

  function renderChatFeed(shouldFollowChat) {
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
      updateJumpToLive();
    }
  }

  function getVisibleMessages() {
    return state.messages.filter((message) => !state.disabledChatSourceIds.has(message.sourceId)).slice(-CHAT_RENDER_WINDOW_SIZE);
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
      state.followingChat = true;
      elements.chatFeed.scrollTop = getMaxScrollTop();
      updateJumpToLive();
      repositionActiveProfileCard();
    });
  }

  function handleChatScroll() {
    if (state.pinnedProfileMessageId) {
      state.followingChat = false;
      updateJumpToLive();
      repositionActiveProfileCard();
      return;
    }

    if (isChatNearBottom()) {
      state.followingChat = true;
    } else {
      state.followingChat = false;
    }

    if (state.followingChat && state.pendingChatRender) {
      state.queueRender();
    }

    updateJumpToLive();
    repositionActiveProfileCard();
  }

  function handleChatWheel(event) {
    if (event.ctrlKey) {
      return;
    }

    cancelScrollEvent(event);
    scrollChatFeedBy(event.deltaY);
  }

  function handleChatTouchStart(event) {
    lastTouchClientY = event.touches[0]?.clientY ?? null;
  }

  function handleChatTouchMove(event) {
    if (event.touches.length !== 1) {
      lastTouchClientY = null;
      return;
    }

    const currentTouchY = event.touches[0]?.clientY ?? null;
    if (currentTouchY === null || lastTouchClientY === null) {
      lastTouchClientY = currentTouchY;
      return;
    }

    const deltaY = lastTouchClientY - currentTouchY;
    cancelScrollEvent(event);
    scrollChatFeedBy(deltaY);
    lastTouchClientY = currentTouchY;
  }

  function scrollChatFeedBy(deltaY) {
    if (!Number.isFinite(deltaY) || deltaY === 0) {
      return;
    }

    const nextScrollTop = clampChatScrollTop(elements.chatFeed.scrollTop + deltaY);

    if (nextScrollTop === elements.chatFeed.scrollTop) {
      if (state.pinnedProfileMessageId) {
        state.followingChat = false;
        updateJumpToLive();
        repositionActiveProfileCard();
        return;
      }

      if (deltaY > 0 && isChatNearBottom()) {
        state.followingChat = true;
        if (state.pendingChatRender) {
          state.queueRender();
        }
        updateJumpToLive();
      }
      return;
    }

    elements.chatFeed.scrollTop = nextScrollTop;
    handleChatScroll();
  }

  function cancelScrollEvent(event) {
    if (event.cancelable) {
      event.preventDefault();
    }
  }

  function positionProfileCard(messageRow) {
    const profileCard = messageRow?.querySelector(".profile-card");
    const anchor = messageRow?.querySelector(".message-line") || messageRow?.querySelector(".message-author") || messageRow;

    if (!profileCard || !anchor) {
      return;
    }

    if (queuedProfileCardFrame) {
      window.cancelAnimationFrame(queuedProfileCardFrame);
    }

    queuedProfileCardFrame = window.requestAnimationFrame(() => {
      queuedProfileCardFrame = 0;
      const gutter = 12;
      const anchorRect = anchor.getBoundingClientRect();
      const messageRect = messageRow.getBoundingClientRect();
      const cardRect = profileCard.getBoundingClientRect();
      const cardWidth = cardRect.width || Math.min(218, window.innerWidth - gutter * 2);
      const availableBottom = getProfileCardAvailableBottom();
      const measuredCardHeight = Math.max(cardRect.height, profileCard.offsetHeight, profileCard.scrollHeight || 0);
      const cardHeight = Math.min(
        measuredCardHeight || 180,
        180,
        availableBottom - gutter,
      );
      const preferredLeft = messageRect.right - cardWidth - gutter;
      const minimumLeft = Math.min(anchorRect.left, messageRect.right - cardWidth);
      const left = clampToViewport(preferredLeft, minimumLeft, window.innerWidth - cardWidth - gutter);
      const preferredTop = messageRect.top - cardHeight - 4;
      const fallbackTop = messageRect.bottom + 4;
      const unclampedTop = preferredTop >= gutter ? preferredTop : fallbackTop;
      const top = clampToViewport(unclampedTop, gutter, availableBottom - cardHeight);
      const maxHeight = Math.max(84, availableBottom - top);

      profileCard.style.setProperty("--profile-card-left", `${Math.round(left)}px`);
      profileCard.style.setProperty("--profile-card-top", `${Math.round(top)}px`);
      profileCard.style.setProperty("--profile-card-max-height", `${Math.round(maxHeight)}px`);
    });
  }

  function repositionActiveProfileCard() {
    const activeMessage = elements.chatFeed.querySelector(".chat-message.is-profile-pinned")
      || elements.chatFeed.querySelector(".chat-message:hover");

    if (activeMessage) {
      positionProfileCard(activeMessage);
    }
  }

  function getProfileCardAvailableBottom() {
    const gutter = 12;
    if (elements.jumpToLive.hidden) {
      return window.innerHeight - gutter;
    }

    const jumpRect = elements.jumpToLive.getBoundingClientRect();
    return Math.max(gutter, jumpRect.top - gutter);
  }

  function isChatNearBottom() {
    return getDistanceFromBottom() <= AUTO_SCROLL_THRESHOLD_PX;
  }

  function clampChatScrollTop(scrollTop) {
    return Math.min(getMaxScrollTop(), Math.max(0, scrollTop));
  }

  function getMaxScrollTop() {
    return Math.max(0, elements.chatFeed.scrollHeight - elements.chatFeed.clientHeight);
  }

  function clampToViewport(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getDistanceFromBottom() {
    return Math.max(0, getMaxScrollTop() - elements.chatFeed.scrollTop);
  }

  function updateJumpToLive() {
    elements.jumpToLive.hidden = !state.pinnedProfileMessageId && state.followingChat;
  }

  function renderChatFilters() {
    const sources = state.sources.filter((source) => source.enabled !== false);
    const filterKey = JSON.stringify(sources.map((source) => ({
      disabled: state.disabledChatSourceIds.has(source.sourceId),
      platform: source.platform,
      sourceId: source.sourceId,
      sourceLabel: source.sourceLabel,
    })));

    if (filterKey === renderedChatFilterKey) {
      return;
    }

    renderedChatFilterKey = filterKey;
    elements.chatFilters.innerHTML = sources.map(renderChatFilter).join("");
  }

  function renderChatFilter(source) {
    const meta = platformMeta[source.platform];
    const isEnabled = !state.disabledChatSourceIds.has(source.sourceId);
    const status = isEnabled ? "On" : "Off";
    const title = `${status}: ${meta.label} / ${source.sourceLabel}`;

    return `
      <button class="chat-filter-toggle ${source.platform}" type="button" data-source-id="${escapeHtml(source.sourceId)}" data-filter-state="${isEnabled ? "on" : "off"}" aria-pressed="${String(isEnabled)}" title="${escapeHtml(title)}">
        <span class="chat-filter-label">
          <span>${escapeHtml(meta.label)}</span>
          <strong>${escapeHtml(source.sourceLabel)}</strong>
        </span>
        <span class="chat-filter-switch" aria-hidden="true">
          <span>${escapeHtml(status)}</span>
        </span>
      </button>
    `;
  }

  function renderSource(source) {
    const meta = platformMeta[source.platform];
    const profile = getSourceProfile(source);
    const sourceStatus = getSourceStatus(source);
    const statusDot = source.platform === "twitch"
      ? renderStatusDot(sourceStatus)
      : "";
    const chipTitle = getSourceChipTitle(meta, source);

    return `
      <div class="source-chip ${source.platform}" aria-label="${escapeHtml(chipTitle)}">
        <span>${escapeHtml(meta.label)}</span>
        <strong>${escapeHtml(source.sourceLabel)}</strong>
        ${statusDot}
        <b class="rolling-number" data-viewer-count-key="${escapeHtml(source.sourceId)}" data-viewer-count-target="${source.viewerCount}">${formatNumber(source.viewerCount)}</b>
        <div class="source-popover" role="tooltip">
          <div class="source-popover-kicker">Profile</div>
          <strong>${escapeHtml(profile.name)}</strong>
          <dl>
            <div>
              <dt>Source</dt>
              <dd>${escapeHtml(`${meta.label} / ${source.sourceLabel}`)}</dd>
            </div>
            <div>
              <dt>Viewers</dt>
              <dd><span class="rolling-number" data-viewer-count-key="${escapeHtml(source.sourceId)}" data-viewer-count-target="${source.viewerCount}">${formatNumber(source.viewerCount)}</span></dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>${escapeHtml(formatSourceStatus(sourceStatus))}</dd>
            </div>
            <div>
              <dt>Handle</dt>
              <dd>${escapeHtml(source.sourceHandle ? `@${source.sourceHandle}` : source.sourceLabel)}</dd>
            </div>
          </dl>
          <div class="source-socials">
            ${profile.sources.map(renderProfileSourceLink).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function getSourceProfile(source) {
    const profileSources = getProfileSources(source);
    const profileName = source.profileName
      || profileSources.find((profileSource) => profileSource.profileName)?.profileName
      || source.sourceName
      || source.sourceLabel;

    return {
      name: profileName,
      sources: profileSources.filter(isSocialProfileSource),
    };
  }

  function isSocialProfileSource(source) {
    return source.platform !== "room";
  }

  function getProfileSources(source) {
    const profileId = String(source.profileId || "").trim();
    const sourceMatches = state.sources.filter((candidate) => {
      if (candidate.enabled === false) {
        return false;
      }

      if (profileId && candidate.profileId === profileId) {
        return true;
      }

      return candidate.sourceId === source.sourceId;
    });
    const sources = sourceMatches.length > 0 ? sourceMatches : [source];
    const uniqueSources = new Map();

    for (const profileSource of sources) {
      const key = [
        profileSource.platform,
        profileSource.sourceUrl || profileSource.sourceHandle || profileSource.sourceId,
      ].join(":");
      uniqueSources.set(key, profileSource);
    }

    return [...uniqueSources.values()].sort(
      (left, right) => PLATFORM_ORDER.indexOf(left.platform) - PLATFORM_ORDER.indexOf(right.platform),
    );
  }

  function renderProfileSourceLink(source) {
    const meta = platformMeta[source.platform];
    const handle = source.sourceHandle ? `@${source.sourceHandle}` : source.sourceLabel;
    const url = source.sourceUrl || meta.source;

    return `
      <a class="source-social-link ${source.platform}" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">
        <span>${escapeHtml(meta.label)}</span>
        <b>${escapeHtml(handle)}</b>
      </a>
    `;
  }

  function getSourceStatus(source) {
    if (source.platform === "twitch") {
      return state.twitchStatuses[source.sourceId] || "connecting";
    }

    return source.viewerCount > 0 ? "connected" : "configured";
  }

  function syncAnimatedViewerCountNode(node, key, target) {
    if (!node || !key) {
      return;
    }

    node.classList.add("rolling-number");
    node.dataset.viewerCountKey = key;
    node.dataset.viewerCountTarget = String(target);

    const normalizedTarget = normalizeAnimatedViewerCount(target);
    let animation = viewerCountAnimations.get(key);

    if (!animation) {
      animation = {
        current: normalizedTarget,
        frameId: 0,
        lastTimestamp: 0,
        nodes: new Set(),
        target: normalizedTarget,
      };
      viewerCountAnimations.set(key, animation);
    }

    pruneAnimatedViewerCountNodes(animation);
    animation.nodes.add(node);
    animation.target = normalizedTarget;

    if (shouldReduceMotion()) {
      stopAnimatedViewerCount(animation);
      animation.current = normalizedTarget;
      renderAnimatedViewerCount(animation);
      return;
    }

    renderAnimatedViewerCount(animation);

    if (animation.current !== animation.target) {
      scheduleAnimatedViewerCountTick(key);
    }
  }

  function tickAnimatedViewerCount(key, timestamp) {
    const animation = viewerCountAnimations.get(key);
    if (!animation) {
      return;
    }

    animation.frameId = 0;

    if (animation.current === animation.target) {
      animation.lastTimestamp = 0;
      return;
    }

    const step = getExponentialViewerCountStep(animation, timestamp);
    animation.current += animation.current < animation.target ? step : -step;
    renderAnimatedViewerCount(animation);

    if (animation.current !== animation.target) {
      scheduleAnimatedViewerCountTick(key);
    } else {
      animation.lastTimestamp = 0;
    }
  }

  function getExponentialViewerCountStep(animation, timestamp) {
    const distance = Math.abs(animation.target - animation.current);
    if (distance <= 1) {
      animation.lastTimestamp = timestamp;
      return distance;
    }

    const frameMs = animation.lastTimestamp
      ? Math.min(VIEWER_COUNT_MAX_FRAME_MS, Math.max(0, timestamp - animation.lastTimestamp))
      : 16.67;
    animation.lastTimestamp = timestamp;

    const deltaSeconds = frameMs / 1000;
    const progress = 1 - Math.exp(-VIEWER_COUNT_EXPONENTIAL_RATE * deltaSeconds);
    return Math.min(distance, Math.max(1, Math.ceil(distance * progress)));
  }

  function scheduleAnimatedViewerCountTick(key) {
    const animation = viewerCountAnimations.get(key);
    if (!animation || animation.frameId) {
      return;
    }

    animation.frameId = window.requestAnimationFrame((timestamp) => tickAnimatedViewerCount(key, timestamp));
  }

  function renderAnimatedViewerCount(animation) {
    pruneAnimatedViewerCountNodes(animation);

    for (const node of animation.nodes) {
      node.textContent = formatNumber(animation.current);
    }
  }

  function pruneAnimatedViewerCountNodes(animation) {
    for (const node of animation.nodes) {
      if (!node.isConnected) {
        animation.nodes.delete(node);
      }
    }
  }

  function stopAnimatedViewerCount(animation) {
    if (animation.frameId) {
      window.cancelAnimationFrame(animation.frameId);
      animation.frameId = 0;
    }

    animation.lastTimestamp = 0;
  }

  function normalizeAnimatedViewerCount(value) {
    const count = Number(value);
    return Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  }

  function shouldReduceMotion() {
    return typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function formatSourceStatus(status) {
    const labels = {
      connected: "Live",
      connecting: "Connecting",
      configured: "Configured",
      disconnected: "Offline",
    };

    return labels[status] || status;
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
    const labels = { connected: "Live", connecting: "Connecting...", disconnected: "Disconnected" };
    return `<em class="live-dot ${status}" title="${labels[status] ?? status}"></em>`;
  }

  function renderMessage(message) {
    const meta = platformMeta[message.platform];
    const profile = getAuthorProfile(message);

    return `
      <article class="chat-message ${message.platform}" data-message-id="${escapeHtml(message.id)}">
        <div class="message-body">
          <span class="platform-mark">
            ${renderPlatformLogo(message.platform, `${meta.label} logo`)}
            <span class="source-label ${message.platform}" title="${escapeHtml(meta.label)} / ${escapeHtml(message.sourceLabel)}">${escapeHtml(message.sourceLabel)}</span>
          </span>
          <div class="message-content">
            <p class="message-line">
              ${renderBadges(message)}
              <strong class="message-author" style="--author-color: ${escapeHtml(message.authorColor)};" title="${escapeHtml(message.author)}">${escapeHtml(message.author)}</strong><span class="message-colon">:</span>
              ${renderMessageBody(message, getTwitchEmoteMap(message))}
            </p>
          </div>
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
              <dt>Source</dt>
              <dd>${escapeHtml(`${meta.label} / ${profile.sourceLabel}`)}</dd>
            </div>
            <div>
              <dt>Profile</dt>
              <dd><a href="${escapeHtml(profile.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(profile.displayHandle)}</a></dd>
            </div>
          </dl>
        </div>
      </article>
    `;
  }

  function renderBadges(message) {
    const badges = (message.badges || []).map((badge) => resolveBadge(message, badge)).filter(Boolean);
    if (badges.length === 0) return "";

    return `
      <span class="chat-badges" aria-label="Chat badges">
        ${badges.map((badge) => renderBadge(message, badge)).join("")}
      </span>
    `;
  }

  function resolveBadge(message, badge) {
    if (!badge?.id) return null;

    if (message.platform !== "twitch") {
      return badge;
    }

    return {
      ...badge,
      ...(getTwitchBadgeMap(message)[`${badge.id}/${badge.version}`] || {}),
    };
  }

  function renderBadge(message, badge) {
    const title = badge.title || badge.label || badge.id;
    const tooltip = getBadgeTooltip(badge);

    if (badge.imageUrl) {
      return `<span class="chat-badge" data-badge-title="${escapeHtml(getBadgeTooltip(badge))}" title="${escapeHtml(tooltip)}"><img class="chat-badge-image" src="${escapeHtml(badge.imageUrl)}" alt="${escapeHtml(badge.label || badge.id)}" title="${escapeHtml(title)}" loading="lazy" decoding="async" /></span>`;
    }

    return `<span class="chat-badge" data-badge-title="${escapeHtml(getBadgeTooltip(badge))}" title="${escapeHtml(tooltip)}"><span class="chat-badge-text ${escapeHtml(message.platform)}" title="${escapeHtml(title)}">${escapeHtml(getBadgeText(badge))}</span></span>`;
  }

  function getBadgeTooltip(badge) {
    const title = badge.title || badge.label || badge.id;
    const version = badge.version && !String(title).includes(String(badge.version))
      ? ` / ${badge.version}`
      : "";
    return `${title}${version}`;
  }

  function getBadgeText(badge) {
    const id = String(badge.id || "").toLowerCase();
    if (id === "broadcaster") return "BC";
    if (id === "moderator") return "MOD";
    if (id === "subscriber") return "SUB";
    if (id === "sub_gifter") return badge.count ? `G${badge.count}` : "GFT";
    if (id === "vip") return "VIP";
    if (id === "og") return "OG";
    if (id === "verified") return "OK";

    return String(badge.label || badge.id || "")
      .split(/\s+/)
      .map((part) => part[0] || "")
      .join("")
      .slice(0, 3)
      .toUpperCase();
  }

  function updateInspectingState() {
    if (state.pinnedProfileMessageId) {
      state.inspectingProfile = true;
      return;
    }

    const wasInspectingProfile = state.inspectingProfile;
    const isBadgeHovered = Boolean(elements.chatFeed.querySelector(".chat-badge:hover"));
    state.inspectingProfile = !isBadgeHovered && (elements.chatFeed.matches(":hover")
      || Boolean(elements.chatFeed.querySelector(".profile-card:hover")));

    if (wasInspectingProfile && !state.inspectingProfile && state.pendingChatRender) {
      state.queueRender();
    }
  }
}

function renderPlatformLogo(platform, label) {
  const logos = {
    twitch: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 3h16v11l-5 5h-4l-3 3v-3H5V3z" />
        <path d="M9 7h2v6H9V7zm6 0h2v6h-2V7z" />
      </svg>
    `,
    kick: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 3h6v6h2V6h2V3h4v6h-2v2h-2v2h2v2h2v6h-6v-5h-2v5H5V3z" />
      </svg>
    `,
    x: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 3h5.1l4 5.7L18 3h2.1l-6 7 6.6 11H15.6l-4.4-6.5L5.8 21H3.7l6.5-7.7L4 3z" />
      </svg>
    `,
    room: '<img src="/assets/market-bubble-logo.jpg" alt="" />',
  };

  return `
    <span class="platform-logo ${escapeHtml(platform)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
      ${logos[platform] || logos.room}
    </span>
  `;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}
