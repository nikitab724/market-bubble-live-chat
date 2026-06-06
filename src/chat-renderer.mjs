import { buildViewerSummary } from "./chat-model.mjs";
import { renderMessageBody } from "./emote-renderer.mjs";
import { escapeHtml, platformMeta } from "./platforms.mjs";

const AUTO_SCROLL_THRESHOLD_PX = 120;
const CHAT_RENDER_WINDOW_SIZE = 500;

export function createChatRenderer({ window, elements, state, getAuthorProfile, getTwitchEmoteMap }) {
  let renderedMessageIds = [];
  let queuedScrollFrame = 0;
  let lastTouchClientY = null;

  return {
    handleChatScroll,
    handleChatTouchMove,
    handleChatTouchStart,
    handleChatWheel,
    render,
    renderPendingChat,
    scrollChatToBottom,
    updateInspectingState,
    updateJumpToLive,
  };

  function render() {
    const shouldFollowChat = state.followingChat || isChatNearBottom();
    state.followingChat = shouldFollowChat;
    const viewerSummary = buildViewerSummary(state.sources);

    elements.viewerCount.textContent = formatNumber(viewerSummary.total);
    elements.sourceBreakdown.innerHTML = viewerSummary.sources.map(renderSource).join("");

    if (state.inspectingProfile && !shouldFollowChat) {
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
    if (isChatNearBottom()) {
      state.followingChat = true;
    } else {
      state.followingChat = false;
    }

    if (state.followingChat && state.pendingChatRender) {
      state.queueRender();
    }

    updateJumpToLive();
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

  function isChatNearBottom() {
    return getDistanceFromBottom() <= AUTO_SCROLL_THRESHOLD_PX;
  }

  function clampChatScrollTop(scrollTop) {
    return Math.min(getMaxScrollTop(), Math.max(0, scrollTop));
  }

  function getMaxScrollTop() {
    return Math.max(0, elements.chatFeed.scrollHeight - elements.chatFeed.clientHeight);
  }

  function getDistanceFromBottom() {
    return Math.max(0, getMaxScrollTop() - elements.chatFeed.scrollTop);
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
    const labels = { connected: "Live", connecting: "Connecting...", disconnected: "Disconnected" };
    return `<em class="live-dot ${status}" title="${labels[status] ?? status}"></em>`;
  }

  function renderMessage(message) {
    const meta = platformMeta[message.platform];
    const profile = getAuthorProfile(message);

    return `
      <article class="chat-message ${message.platform}">
        <div class="message-body">
          <div class="message-meta">
            ${renderPlatformLogo(message.platform, `${meta.label} logo`)}
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

  function updateInspectingState() {
    const wasInspectingProfile = state.inspectingProfile;
    state.inspectingProfile = elements.chatFeed.matches(":hover");

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
    room: "<b>MB</b>",
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

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}
