import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function readAppRuntime() {
  return [
    "../src/app.mjs",
    "../src/chat-renderer.mjs",
    "../src/chat-runtime.mjs",
    "../src/client-sources.mjs",
    "../src/demo-chat.mjs",
    "../src/platforms.mjs",
    "../src/viewer-stream.mjs",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
}

describe("chat interaction contract", () => {
  it("renders the hosted viewer page with stream and chat", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

    assert.equal(html.includes("stream-view"), true);
    assert.equal(html.includes("video-frame"), true);
    assert.equal(html.includes("Market Bubble stream"), true);
    assert.equal(html.includes("broadcast-topbar"), true);
    assert.equal(html.includes("stream-header"), false);
    assert.equal(html.includes("chat-header"), false);
    assert.equal(html.includes('id="streamPlayer"'), true);
    assert.equal(html.includes('class="chat-view"'), true);
    assert.equal(html.includes('id="chatFeed"'), true);
    assert.equal(html.includes('id="jumpToLive"'), true);
    assert.equal(html.includes('id="viewerCount"'), true);
    assert.equal(html.includes('id="sourceBreakdown"'), true);
  });

  it("renders /chat as the chat-only embed surface", () => {
    const html = readFileSync(new URL("../chat/index.html", import.meta.url), "utf8");

    assert.equal(html.includes("stream-view"), false);
    assert.equal(html.includes("video-frame"), false);
    assert.equal(html.includes("Market Bubble stream"), false);
    assert.equal(html.includes("broadcast-topbar"), true);
    assert.equal(html.includes("chat-header"), false);
    assert.equal(html.includes('class="chat-view"'), true);
    assert.equal(html.includes('id="chatFeed"'), true);
    assert.equal(html.includes('id="jumpToLive"'), true);
    assert.equal(html.includes('id="viewerCount"'), true);
    assert.equal(html.includes('id="sourceBreakdown"'), true);
  });

  it("cache-busts the app module on both chat surfaces", () => {
    const viewer = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const chat = readFileSync(new URL("../chat/index.html", import.meta.url), "utf8");

    assert.match(viewer, /src="\.\/src\/app\.mjs\?v=[^"]+"/);
    assert.match(chat, /src="\.\.\/src\/app\.mjs\?v=[^"]+"/);
  });

  it("does not keep profile cards open through row focus", () => {
    const app = readAppRuntime();
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(app.includes('class="chat-message" tabindex="0"'), false);
    assert.equal(app.includes('addEventListener("focusin"'), false);
    assert.equal(app.includes('addEventListener("focusout"'), false);
    assert.equal(styles.includes(".chat-message:focus"), false);
    assert.equal(app.includes("pendingChatRender"), true);
    assert.equal(app.includes("if (state.inspectingProfile && !shouldFollowChat)"), true);
    assert.equal(app.includes("state.pendingChatRender = true"), true);
    assert.equal(app.includes("state.pendingChatRender = false"), true);
    assert.equal(app.includes("renderChatFeed"), true);
    assert.equal(app.includes("renderer.positionProfileCard(message);"), true);
    assert.equal(app.includes('elements.chatFeed.addEventListener("pointermove"'), true);
    assert.equal(app.includes("const preferredLeft = messageRect.right - cardWidth - gutter"), true);
    assert.equal(app.includes("const preferredTop = messageRect.bottom - 1"), true);
    assert.equal(app.includes("const top = clampToViewport(preferredTop"), true);
    assert.equal(app.includes("--profile-card-max-height"), true);
    assert.equal(app.includes('elements.chatFeed.querySelector(".profile-card:hover")'), true);
    assert.match(styles, /\.profile-card\s*\{[^}]*display: none/s);
    assert.match(styles, /\.profile-card\s*\{[^}]*position: fixed[^}]*left: var\(--profile-card-left, 24px\)[^}]*top: var\(--profile-card-top, 24px\)/s);
    assert.match(styles, /\.profile-card\s*\{[^}]*overflow: auto/s);
    assert.match(styles, /\.chat-message:hover\s+\.profile-card,\s*\.profile-card:hover\s*\{[^}]*display: block/s);
  });

  it("does not render user profile picture placeholders in chat rows", () => {
    const app = readAppRuntime();
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(app.includes('class="avatar'), false);
    assert.equal(styles.includes(".avatar"), false);
  });

  it("renders compact platform logos before chat usernames", () => {
    const app = readAppRuntime();
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(app.includes("renderPlatformLogo"), true);
    assert.equal(app.includes('class="platform-logo ${escapeHtml(platform)}"'), true);
    assert.equal(app.includes('aria-label="${escapeHtml(label)}"'), true);
    assert.equal(app.includes("twitch:"), true);
    assert.equal(app.includes("kick:"), true);
    assert.equal(app.includes("x:"), true);
    assert.match(app, /renderPlatformLogo\(message\.platform,\s*`\$\{meta\.label\} logo`\)\}\s*\n\s*<strong title/);
    assert.match(styles, /\.platform-logo\s*\{[^}]*width: 18px[^}]*height: 18px/s);
    assert.match(styles, /\.chat-message\s*\{[^}]*padding: 7px 10px/s);
    assert.match(styles, /\.message-meta\s*\{[^}]*gap: 5px/s);
  });

  it("uses the Market Bubble broadcast treatment with platform color accents", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const app = readAppRuntime();

    assert.equal(html.includes("broadcast-topbar"), true);
    assert.equal(html.includes("broadcast-metrics"), true);
    assert.equal(html.includes("broadcast-clock"), false);
    assert.match(styles, /\.app-shell\s*\{[^}]*height: calc\(100vh - 52px\)[^}]*padding: 10px 12px 12px/s);
    assert.match(styles, /\.viewer-shell\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(360px, 420px\)[^}]*gap: 10px/s);
    assert.equal(styles.includes("--bg:"), true);
    assert.equal(styles.includes("--display-font"), true);
    assert.equal(styles.includes("Bodoni 72"), true);
    assert.equal(styles.includes("--twitch:"), true);
    assert.equal(styles.includes("--kick:"), true);
    assert.equal(styles.includes("--x:"), true);
    assert.equal(app.includes("x-banks"), true);
    assert.equal(app.includes("x-z"), true);
    assert.equal(app.includes("room-marketbubble"), true);
  });

  it("loads source config from the backend with a static fallback", () => {
    const app = readAppRuntime();

    assert.equal(app.includes("/api/public-config"), true);
    assert.equal(app.includes("fallbackSources"), true);
    assert.equal(app.includes("loadPublicConfig"), true);
  });

  it("refreshes live stream state from the backend", () => {
    const app = readAppRuntime();

    assert.equal(app.includes("/api/live-state"), true);
    assert.equal(app.includes("refreshLiveState"), true);
    assert.equal(app.includes("viewerCountLocked"), true);
    assert.equal(app.includes('source.platform === "twitch" && source.viewerCountLocked'), false);
  });

  it("renders the admin-selected livestream source for supported platforms", () => {
    const app = readAppRuntime();

    assert.equal(app.includes("initStreamPlayer"), true);
    assert.equal(app.includes("getSelectedStreamSource"), true);
    assert.equal(app.includes("source.showStream"), true);
    assert.equal(app.includes("createTwitchStreamFrame"), true);
    assert.equal(app.includes("createKickStreamFrame"), true);
    assert.equal(app.includes("renderXStreamEmbed"), true);
    assert.equal(app.includes("https://player.kick.com/"), true);
    assert.equal(app.includes("https://platform.x.com/widgets.js"), true);
  });

  it("listens for backend chat events", () => {
    const app = readAppRuntime();

    assert.match(app, /new (window\.)?EventSource\("\/api\/chat-events"\)/);
    assert.equal(app.includes("/api/chat-events/recent"), false);
    assert.equal(app.includes("pollBackendChatEvents"), false);
    assert.equal(app.includes("startBackendChatEvents"), true);
    assert.equal(app.includes("addBackendMessage"), true);
  });

  it("keeps every chat message received during the viewer session", () => {
    const app = readAppRuntime();

    assert.equal(app.includes("MAX_CHAT_MESSAGES"), false);
    assert.equal(app.includes(".slice(0, 60)"), false);
    assert.equal(app.includes("keepRecentMessages"), false);
    assert.equal(app.includes(".slice(-MAX_CHAT_MESSAGES)"), false);
    assert.equal(app.includes("state.messages = state.messages.slice"), false);
  });

  it("keeps the chat viewport pinned to the newest bottom messages until the viewer scrolls up", () => {
    const app = readAppRuntime();
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(app.includes("scrollChatToBottom"), true);
    assert.equal(app.includes("isChatNearBottom"), true);
    assert.equal(app.includes("handleChatScroll"), true);
    assert.equal(app.includes("jumpToLive"), true);
    assert.equal(app.includes("followingChat: true"), true);
    assert.equal(app.includes("state.followingChat = false"), true);
    assert.equal(app.includes("state.followingChat = true"), true);
    assert.equal(app.includes("AUTO_SCROLL_THRESHOLD_PX = 120"), true);
    assert.equal(app.includes("getDistanceFromBottom"), true);
    assert.equal(app.includes("const shouldFollowChat = state.followingChat || isChatNearBottom()"), true);
    assert.equal(app.includes('class="chat-stack"'), true);
    assert.equal(app.includes("elements.chatFeed.scrollTop = getMaxScrollTop()"), true);
    assert.match(styles, /\.chat-stack\s*\{[^}]*display: flex[^}]*flex-direction: column[^}]*justify-content: flex-end[^}]*min-height: 100%/s);
    assert.match(styles, /\.chat-feed\s*\{[^}]*overflow-y: hidden[^}]*overflow-anchor: none/s);
    assert.match(styles, /\.profile-card\s*\{[^}]*position: fixed[^}]*left: var\(--profile-card-left, 24px\)[^}]*top: var\(--profile-card-top, 24px\)/s);
    assert.match(styles, /\.jump-to-live\s*\{[^}]*position: absolute/s);
    assert.match(styles, /\.jump-to-live\s*\{[^}]*left: 50%[^}]*transform: translateX\(-50%\)/s);
    assert.match(styles, /\.jump-to-live\[hidden\]\s*\{[^}]*display: none/s);
  });

  it("freezes chat DOM updates while reading older messages and renders pending chat on jump to live", () => {
    const app = readAppRuntime();

    assert.equal(app.includes("shouldPauseChatRender"), true);
    assert.equal(app.includes("if (state.inspectingProfile && !shouldFollowChat)"), true);
    assert.equal(app.includes("if (state.inspectingProfile)"), false);
    assert.match(app, /if \(shouldPauseChatRender\(shouldFollowChat\)\)\s*\{/);
    assert.match(app, /state\.pendingChatRender = true;[\s\S]*updateJumpToLive\(\);[\s\S]*return;/);
    assert.equal(app.includes("renderPendingChat"), true);
    assert.match(app, /elements\.jumpToLive\.addEventListener\("click", \(\) => \{[\s\S]*renderer\.renderPendingChat\(\);/);
    assert.match(app, /if \(state\.followingChat && state\.pendingChatRender\) \{[\s\S]*state\.queueRender\(\);/);
  });

  it("coalesces bursty chat updates while keeping native scrolling locked down", () => {
    const app = readAppRuntime();
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(app.includes("CHAT_RENDER_INTERVAL_MS = 80"), true);
    assert.equal(app.includes("function queueRender"), true);
    assert.equal(app.includes("function flushQueuedRender"), true);
    assert.equal(app.includes("queuedRenderFrame"), true);
    assert.equal(app.includes("queuedScrollFrame"), true);
    assert.equal(app.includes("window.cancelAnimationFrame(queuedScrollFrame)"), true);
    assert.match(styles, /\.chat-feed\s*\{[^}]*overflow-y: hidden[^}]*overflow-anchor: none/s);
  });

  it("prevents rubber-band scrolling past chat boundaries", () => {
    const app = readAppRuntime();
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(app.includes("chatView: document.querySelector(\".chat-view\")"), true);
    assert.equal(app.includes("handleChatWheel"), true);
    assert.equal(app.includes("handleChatTouchStart"), true);
    assert.equal(app.includes("handleChatTouchMove"), true);
    assert.equal(app.includes('addEventListener("scroll", renderer.handleChatScroll'), false);
    assert.equal(app.includes("cancelScrollEvent(event);"), true);
    assert.equal(app.includes("scrollChatFeedBy"), true);
    assert.equal(app.includes("clampChatScrollTop"), true);
    assert.equal(app.includes("const nextScrollTop = clampChatScrollTop(elements.chatFeed.scrollTop + deltaY)"), true);
    assert.equal(app.includes("preventBoundaryBounce"), false);
    assert.equal(app.includes("routePanelScrollToFeed"), false);
    assert.match(app, /elements\.chatView\.addEventListener\("wheel", renderer\.handleChatWheel, \{ capture: true, passive: false \}\)/);
    assert.match(app, /elements\.chatView\.addEventListener\("touchmove", renderer\.handleChatTouchMove, \{ capture: true, passive: false \}\)/);
    assert.match(app, /if \(event\.cancelable\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*\}/);
    assert.match(styles, /html\s*\{[^}]*height: 100%[^}]*overflow: hidden[^}]*overscroll-behavior: none/s);
    assert.match(styles, /body\s*\{[^}]*position: fixed[^}]*inset: 0[^}]*overflow: hidden[^}]*overscroll-behavior: none/s);
    assert.match(styles, /\.chat-view\s*\{[^}]*overscroll-behavior: none/s);
    assert.match(styles, /\.chat-feed\s*\{[^}]*overflow-y: hidden[^}]*touch-action: none/s);
  });

  it("appends new chat rows without rebuilding the full chat history", () => {
    const app = readAppRuntime();

    assert.equal(app.includes("renderedMessageIds"), true);
    assert.equal(app.includes("function canAppendMessages"), true);
    assert.equal(app.includes("insertAdjacentHTML(\"beforeend\""), true);
    assert.equal(app.includes('elements.chatFeed.innerHTML = `<div class="chat-stack">${state.messages.map(renderMessage).join("")}</div>`'), false);
  });

  it("mounts only a rolling live chat window while keeping full message state", () => {
    const app = readAppRuntime();

    assert.equal(app.includes("CHAT_RENDER_WINDOW_SIZE = 500"), true);
    assert.equal(app.includes("function getVisibleMessages"), true);
    assert.equal(app.includes("state.messages.slice(-CHAT_RENDER_WINDOW_SIZE)"), true);
    assert.equal(app.includes("function getWindowOverlapLength"), true);
    assert.equal(app.includes("function removeStaleRows"), true);
  });

  it("ingests chronological chat messages without remerging the full history", () => {
    const app = readAppRuntime();

    assert.equal(app.includes("knownMessageIds"), true);
    assert.equal(app.includes("function addMessage"), true);
    assert.equal(app.includes("state.messages.push(message)"), true);
    assert.doesNotMatch(app, /state\.messages = mergeMessages\(\[\s*\.\.\.state\.messages,\s*normalizeMessage\(rawMessage\),\s*\]\);/);
  });

  it("uses cached author profiles instead of scanning all messages per rendered row", () => {
    const app = readAppRuntime();

    assert.equal(app.includes("authorProfilesByKey"), true);
    assert.equal(app.includes("function recordAuthorProfile"), true);
    assert.equal(app.includes("function getAuthorProfile"), true);
    assert.equal(app.includes("buildAuthorProfile(state.messages, message)"), false);
  });

  it("loads and renders Twitch emotes", () => {
    const app = readAppRuntime();
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(app.includes("/api/twitch-emotes"), true);
    assert.equal(app.includes("loadTwitchEmotes"), true);
    assert.equal(app.includes("renderMessageBody"), true);
    assert.equal(app.includes("escapeHtml(message.body)"), false);
    assert.equal(styles.includes(".chat-emote"), true);
  });

  it("does not expose manual viewer count editing or fake viewer movement", () => {
    const admin = readFileSync(new URL("../admin/admin.mjs", import.meta.url), "utf8");
    const app = readAppRuntime();

    assert.equal(admin.includes('createNumberField("Viewers"'), false);
    assert.equal(admin.includes('[name="viewerCount"]'), false);
    assert.equal(admin.includes("createNumberField"), false);
    assert.equal(app.includes("nudgeViewerCounts"), false);
  });

  it("renders admin source editing as expandable profiles", () => {
    const html = readFileSync(new URL("../admin/index.html", import.meta.url), "utf8");
    const admin = readFileSync(new URL("../admin/admin.mjs", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(html.includes("Profile Manager"), true);
    assert.equal(html.includes('id="addProfileButton"'), true);
    assert.equal(html.includes('id="profileCards"'), true);
    assert.equal(admin.includes("buildProfilesFromSources"), true);
    assert.equal(admin.includes("toggleProfile"), true);
    assert.equal(admin.includes("profile-toggle-icon"), true);
    assert.equal(admin.includes("createStreamField"), true);
    assert.equal(admin.includes("enforceOneStreamSelection"), true);
    assert.equal(admin.includes('input.name = "showStream"'), true);
    assert.equal(styles.includes(".profile-editor-card"), true);
    assert.equal(styles.includes(".profile-social-grid"), true);
    assert.equal(styles.includes(".profile-stream-field"), true);
    assert.equal(styles.includes(".profile-editor-body[hidden]"), true);
    assert.equal(styles.includes(".profile-toggle-icon"), true);
  });
});
