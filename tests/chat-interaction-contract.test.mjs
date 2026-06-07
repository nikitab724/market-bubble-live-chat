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

function readViewerRuntime() {
  return [
    "../src/ui/main.jsx",
    "../src/ui/ViewerApp.jsx",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
}

describe("chat interaction contract", () => {
  it("mounts the hosted viewer page through the React shell", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const viewer = readViewerRuntime();

    assert.equal(html.includes('id="root"'), true);
    assert.equal(html.includes('data-surface="viewer"'), true);
    assert.equal(html.includes("/src/ui/main.jsx"), true);
    assert.equal(viewer.includes("stream-view"), true);
    assert.equal(viewer.includes("video-frame"), true);
    assert.equal(viewer.includes("Market Bubble stream"), true);
    assert.equal(viewer.includes("broadcast-topbar"), true);
    assert.equal(html.includes("stream-header"), false);
    assert.equal(html.includes("chat-header"), false);
    assert.equal(viewer.includes('id="streamPlayer"'), true);
    assert.equal(viewer.includes('className="chat-view"'), true);
    assert.equal(viewer.includes('id="chatFeed"'), true);
    assert.equal(viewer.includes('id="jumpToLive"'), true);
    assert.equal(viewer.includes('id="viewerCount"'), true);
    assert.equal(viewer.includes('id="sourceBreakdown"'), true);
    assert.match(readFileSync(new URL("../styles.css", import.meta.url), "utf8"), /\.chat-shell\s+\.chat-view\s*\{[^}]*border: 0[^}]*background: transparent[^}]*box-shadow: none/s);
  });

  it("mounts /chat as the chat-only embed surface", () => {
    const html = readFileSync(new URL("../chat/index.html", import.meta.url), "utf8");
    const viewer = readViewerRuntime();

    assert.equal(html.includes('id="root"'), true);
    assert.equal(html.includes('data-surface="chat"'), true);
    assert.equal(html.includes("/src/ui/main.jsx"), true);
    assert.equal(viewer.includes("surface === \"viewer\""), true);
    assert.equal(viewer.includes("stream-view"), true);
    assert.equal(viewer.includes("video-frame"), true);
    assert.equal(viewer.includes("Market Bubble stream"), true);
    assert.equal(viewer.includes("broadcast-topbar"), true);
    assert.equal(html.includes("chat-header"), false);
    assert.equal(viewer.includes('className="chat-view"'), true);
    assert.equal(viewer.includes('id="chatFeed"'), true);
    assert.equal(viewer.includes('id="jumpToLive"'), true);
    assert.equal(viewer.includes('id="viewerCount"'), true);
    assert.equal(viewer.includes('id="sourceBreakdown"'), true);
  });

  it("uses the same React entry on both chat surfaces", () => {
    const viewer = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const chat = readFileSync(new URL("../chat/index.html", import.meta.url), "utf8");

    assert.match(viewer, /src="\/src\/ui\/main\.jsx"/);
    assert.match(chat, /src="\/src\/ui\/main\.jsx"/);
    assert.equal(viewer.includes("?v="), false);
    assert.equal(chat.includes("?v="), false);
  });

  it("adds a main-viewer-only mini layout mode", () => {
    const viewer = readViewerRuntime();
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(viewer.includes("LAYOUT_STORAGE_KEY"), true);
    assert.equal(viewer.includes("function getInitialLayout(surface)"), true);
    assert.equal(viewer.includes('searchParams.get("layout")'), true);
    assert.equal(viewer.includes('surface === "viewer"'), true);
    assert.equal(viewer.includes("live-layout-${effectiveLayout}"), true);
    assert.equal(viewer.includes('className="layout-toggle"'), true);
    assert.equal(viewer.includes("showStream &&"), true);
    assert.match(styles, /\.live-surface\s*\{[^}]*width: 100%[^}]*height: 100%/s);
    assert.match(styles, /\.live-layout-mini\s*\{[^}]*background: #050505/s);
    assert.match(styles, /\.live-layout-mini\s+\.broadcast-topbar\s*\{[^}]*position: absolute[^}]*top: 50%[^}]*width: 220px[^}]*background: transparent[^}]*box-shadow: none[^}]*animation: none/s);
    assert.match(styles, /\.live-layout-mini\s+\.viewer-shell\s*\{[^}]*height: 100vh[^}]*grid-template-columns: minmax\(520px, 1fr\) minmax\(270px, 320px\)/s);
    assert.match(styles, /\.live-layout-mini\s+\.stream-view\s*\{[^}]*align-self: center[^}]*aspect-ratio: 16 \/ 10[^}]*border-radius: 32px/s);
    assert.match(styles, /\.live-layout-mini\s+\.chat-view\s*\{[^}]*background: transparent[^}]*box-shadow: none/s);
    assert.equal(styles.includes(".chat-shell .layout-toggle"), false);
  });

  it("does not keep profile cards open through row focus", () => {
    const app = readAppRuntime();
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(app.includes('class="chat-message" tabindex="0"'), false);
    assert.equal(app.includes('elements.chatFeed.addEventListener("focusin"'), false);
    assert.equal(app.includes('elements.chatFeed.addEventListener("focusout"'), false);
    assert.equal(styles.includes(".chat-message:focus"), false);
    assert.equal(app.includes("pendingChatRender"), true);
    assert.equal(app.includes("if (state.inspectingProfile && !shouldFollowChat)"), true);
    assert.equal(app.includes("state.pendingChatRender = true"), true);
    assert.equal(app.includes("state.pendingChatRender = false"), true);
    assert.equal(app.includes("renderChatFeed"), true);
    assert.equal(app.includes("renderer.positionProfileCard(message);"), true);
    assert.equal(app.includes('elements.chatFeed.addEventListener("pointermove"'), true);
    assert.equal(app.includes("const preferredLeft = messageRect.right - cardWidth - gutter"), true);
    assert.equal(app.includes('messageRow?.querySelector(".message-line")'), true);
    assert.equal(app.includes("const preferredTop = anchorRect.bottom + 4"), true);
    assert.equal(app.includes("const top = clampToViewport(preferredTop"), true);
    assert.equal(app.includes("return Math.min(max, Math.max(min, value));"), true);
    assert.equal(app.includes("--profile-card-max-height"), true);
    assert.equal(app.includes('elements.chatFeed.querySelector(".profile-card:hover")'), true);
    assert.match(styles, /\.profile-card\s*\{[^}]*display: none/s);
    assert.match(styles, /\.profile-card\s*\{[^}]*position: fixed[^}]*left: var\(--profile-card-left, 24px\)[^}]*top: var\(--profile-card-top, 24px\)/s);
    assert.match(styles, /\.profile-card\s*\{[^}]*overflow: auto/s);
    assert.match(styles, /\.chat-message:hover\s*\{[^}]*z-index: 20/s);
    assert.match(styles, /\.chat-feed\.has-profile-pin\s+\.chat-message:hover:not\(\.is-profile-pinned\)\s*\{[^}]*z-index: auto/s);
    assert.match(styles, /\.chat-message\.is-profile-pinned\s*\{[^}]*z-index: 80/s);
    assert.match(styles, /\.profile-card\s*\{[^}]*z-index: 90/s);
    assert.match(styles, /\.chat-feed:not\(\.has-profile-pin\)\s+\.chat-message:hover\s+\.profile-card,\s*\.chat-message\.is-profile-pinned\s+\.profile-card,\s*\.chat-feed:not\(\.has-profile-pin\)\s+\.profile-card:hover\s*\{[^}]*display: block/s);
  });

  it("keeps profile hover cards from colliding with jump-to-live", () => {
    const app = readAppRuntime();
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(app.includes("function getProfileCardAvailableBottom()"), true);
    assert.equal(app.includes("if (elements.jumpToLive.hidden)"), true);
    assert.equal(app.includes("const jumpRect = elements.jumpToLive.getBoundingClientRect();"), true);
    assert.equal(app.includes("return Math.max(gutter, jumpRect.top - gutter);"), true);
    assert.equal(app.includes("const availableBottom = getProfileCardAvailableBottom();"), true);
    assert.equal(app.includes("availableBottom - cardHeight"), true);
    assert.equal(app.includes("const maxHeight = Math.max(96, availableBottom - top);"), true);
    assert.equal(app.includes("function repositionActiveProfileCard()"), true);
    assert.equal(app.includes('elements.chatFeed.querySelector(".chat-message.is-profile-pinned")'), true);
    assert.equal(app.includes('elements.chatFeed.querySelector(".chat-message:hover")'), true);
    assert.equal(app.includes("repositionActiveProfileCard();"), true);
    assert.match(styles, /\.app-shell\s*\{[^}]*animation: shell-calm-in 700ms var\(--ease-out\) 80ms backwards/s);
    assert.match(app, /elements\.jumpToLive\.addEventListener\("click", \(\) => \{[\s\S]*state\.inspectingProfile = false;[\s\S]*renderer\.renderPendingChat\(\);/);
  });

  it("locks profile cards on click until an outside click", () => {
    const app = readAppRuntime();
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(app.includes("pinnedProfileMessageId"), true);
    assert.equal(app.includes('data-message-id="${escapeHtml(message.id)}"'), true);
    assert.equal(app.includes('elements.chatFeed.addEventListener("click", handleProfilePinClick);'), true);
    assert.equal(app.includes('document.addEventListener("click", handleDocumentProfileUnpinClick);'), true);
    assert.equal(app.includes("function handleProfilePinClick(event)"), true);
    assert.equal(app.includes('event.target.closest(".profile-card a")'), true);
    assert.equal(app.includes("event.stopPropagation();"), true);
    assert.equal(app.includes("function clearPinnedProfileCard"), true);
    assert.equal(app.includes('elements.chatFeed.querySelector(".chat-message.is-profile-pinned")'), true);
    assert.equal(app.includes('message.classList.add("is-profile-pinned")'), true);
    assert.equal(app.includes('elements.chatFeed.classList.add("has-profile-pin")'), true);
    assert.equal(app.includes('elements.chatFeed.classList.remove("has-profile-pin")'), true);
    assert.equal(app.includes("state.pinnedProfileMessageId = message.dataset.messageId || \"\""), true);
    assert.equal(app.includes("if (state.pinnedProfileMessageId) return;"), true);
    assert.equal(app.includes("if (state.pinnedProfileMessageId) {"), true);
    assert.equal(app.includes("const shouldFollowChat = state.pinnedProfileMessageId ? false : state.followingChat || isChatNearBottom();"), true);
    assert.match(app, /elements\.jumpToLive\.addEventListener\("click", \(\) => \{[\s\S]*clearPinnedProfileCard\(\{ syncScroll: false \}\);[\s\S]*renderer\.renderPendingChat\(\);/);
    assert.match(styles, /\.chat-feed:not\(\.has-profile-pin\)\s+\.chat-message:hover\s+\.profile-card,\s*\.chat-message\.is-profile-pinned\s+\.profile-card,\s*\.chat-feed:not\(\.has-profile-pin\)\s+\.profile-card:hover\s*\{[^}]*display: block/s);
  });

  it("keeps profile hover cards compact beside twitch-sized chat", () => {
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.match(styles, /\.profile-card\s*\{[^}]*width: min\(270px, calc\(100vw - 28px\)\)[^}]*padding: 10px/s);
    assert.match(styles, /\.profile-card\s*\{[^}]*background: #000/s);
    assert.match(styles, /\.profile-card\s*\{[^}]*box-shadow:\s*inset 0 0 0 1px rgba\(0, 0, 0, 0\.9\),\s*0 18px 48px rgba\(0, 0, 0, 0\.9\)/s);
    assert.match(styles, /\.profile-card a\s*\{[^}]*display: block[^}]*pointer-events: auto/s);
    assert.match(styles, /\.profile-card-header\s*\{[^}]*margin-bottom: 8px/s);
    assert.match(styles, /\.profile-card-header strong\s*\{[^}]*font-size: 20px/s);
    assert.match(styles, /\.profile-card-header span\s*\{[^}]*font-size: 11px/s);
    assert.match(styles, /\.profile-card dl\s*\{[^}]*gap: 5px/s);
    assert.match(styles, /\.profile-card dl div\s*\{[^}]*grid-template-columns: 68px minmax\(0, 1fr\)[^}]*gap: 6px/s);
    assert.match(styles, /\.profile-card dt\s*\{[^}]*font-size: 11px/s);
    assert.match(styles, /\.profile-card dd\s*\{[^}]*font-size: 11px/s);
  });

  it("does not render user profile picture placeholders in chat rows", () => {
    const app = readAppRuntime();
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(app.includes('class="avatar'), false);
    assert.equal(styles.includes(".avatar"), false);
  });

  it("renders compact platform logos with streamer labels under the logo", () => {
    const app = readAppRuntime();
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(app.includes("renderPlatformLogo"), true);
    assert.equal(app.includes('class="platform-logo ${escapeHtml(platform)}"'), true);
    assert.equal(app.includes('class="platform-mark"'), true);
    assert.equal(app.includes('class="message-content"'), true);
    assert.equal(app.includes('aria-label="${escapeHtml(label)}"'), true);
    assert.equal(app.includes("twitch:"), true);
    assert.equal(app.includes("kick:"), true);
    assert.equal(app.includes("x:"), true);
    assert.equal(app.includes('class="platform-badge ${message.platform}"'), false);
    assert.match(app, /<div class="message-body">\s*<span class="platform-mark">\s*\$\{renderPlatformLogo\(message\.platform,\s*`\$\{meta\.label\} logo`\)\}\s*<span class="source-label \$\{message\.platform\}"/);
    assert.match(app, /<\/span>\s*<div class="message-content">\s*<p class="message-line">\s*<strong class="message-author" style="--author-color: \$\{escapeHtml\(message\.authorColor\)\};" title="\$\{escapeHtml\(message\.author\)\}">/);
    assert.match(app, /<\/strong><span class="message-colon">:<\/span>\s*\$\{renderMessageBody\(message, getTwitchEmoteMap\(message\)\)\}/);
    assert.equal(app.includes("<time>${formatTime(message.timestamp)}</time>"), false);
    assert.equal(app.includes("<dt>Last seen</dt>"), true);
    assert.match(styles, /\.message-body\s*\{[^}]*display: flex[^}]*gap: 5px/s);
    assert.match(styles, /\.message-content\s*\{[^}]*flex: 1 1 auto/s);
    assert.match(styles, /\.platform-logo\s*\{[^}]*width: 18px[^}]*height: 18px/s);
    assert.match(styles, /\.platform-mark\s*\{[^}]*display: grid[^}]*justify-items: center/s);
    assert.match(styles, /\.chat-message\s*\{[^}]*padding: 7px 10px/s);
    assert.match(styles, /\.source-label\s*\{[^}]*width: 100%[^}]*border: 0[^}]*background: transparent[^}]*text-align: center/s);
    assert.equal(styles.includes(".message-line time"), false);
    assert.match(styles, /\.message-author\s*\{[^}]*color: var\(--author-color, var\(--text\)\)/s);
    assert.match(styles, /\.message-colon\s*\{[^}]*color: var\(--muted\)/s);
  });

  it("keeps chat rows tight and borderless", () => {
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const chatMessageRule = [...styles.matchAll(/\.chat-message\s*\{(?<body>[^}]*)\}/gs)]
      .map((match) => match.groups.body)
      .find((body) => body.includes("border: 0")) || "";

    assert.equal(chatMessageRule.includes("border-bottom:"), false);
    assert.equal(chatMessageRule.includes("border-left:"), false);
    assert.match(chatMessageRule, /border: 0/);
    assert.match(chatMessageRule, /background: transparent/);
    assert.match(styles, /\.chat-message p\s*\{[^}]*margin: 0/s);
    assert.equal(styles.includes("margin-left: 51px;"), false);
  });

  it("uses the Market Bubble broadcast treatment with profile source popovers", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const viewer = readViewerRuntime();
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const app = readAppRuntime();

    assert.equal(html.includes('data-surface="viewer"'), true);
    assert.equal(viewer.includes("broadcast-topbar"), true);
    assert.equal(viewer.includes("broadcast-metrics"), true);
    assert.equal(html.includes("broadcast-clock"), false);
    assert.match(styles, /\.app-shell\s*\{[^}]*height: calc\(100vh - 52px\)[^}]*padding: 10px 12px 12px/s);
    assert.match(styles, /\.viewer-shell\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(360px, 420px\)[^}]*gap: 10px/s);
    assert.equal(styles.includes("--bg:"), true);
    assert.equal(styles.includes("--display-font"), true);
    assert.equal(styles.includes("Bodoni 72"), true);
    assert.equal(styles.includes("--twitch:"), true);
    assert.equal(styles.includes("--kick:"), true);
    assert.equal(styles.includes("--x:"), true);
    assert.match(styles, /\.viewer-counter\s*\{[^}]*border: 0[^}]*background: transparent[^}]*box-shadow: none/s);
    assert.match(styles, /\.source-chip\s*\{[^}]*border: 0[^}]*background: transparent[^}]*box-shadow: none/s);
    assert.match(styles, /\.source-popover\s*\{[^}]*position: absolute[^}]*right: 0[^}]*top: calc\(100% - 1px\)/s);
    assert.match(styles, /\.source-popover\s*\{[^}]*width: min\(248px, calc\(100vw - 24px\)\)/s);
    assert.match(styles, /\.source-popover\s*\{[^}]*max-height: calc\(100vh - 66px\)[^}]*overflow: auto/s);
    assert.match(styles, /\.source-popover\s*\{[^}]*background: #111/s);
    assert.match(styles, /\.source-popover\s*\{[^}]*visibility: hidden/s);
    assert.equal(styles.includes(".source-chip::before"), false);
    assert.equal(styles.includes(".source-popover::before"), false);
    assert.match(styles, /\.source-chip:hover\s+\.source-popover\s*\{[^}]*opacity: 1[^}]*visibility: visible/s);
    assert.equal(styles.includes(".source-chip:focus-within .source-popover"), false);
    assert.equal(app.includes("positionSourcePopover"), false);
    assert.equal(app.includes("handleSourcePopoverPosition"), false);
    assert.equal(app.includes('elements.sourceBreakdown.addEventListener("pointermove"'), false);
    assert.equal(app.includes("--source-popover-left"), false);
    assert.equal(app.includes("function getSourceProfile(source)"), true);
    assert.equal(app.includes("function getProfileSources(source)"), true);
    assert.equal(app.includes("function isSocialProfileSource(source)"), true);
    assert.equal(app.includes(".filter(isSocialProfileSource)"), true);
    assert.equal(app.includes("function renderProfileSourceLink(source)"), true);
    assert.equal(app.includes('class="source-social-link ${source.platform}"'), true);
    assert.equal(app.includes('class="source-popover"'), true);
    assert.equal(app.includes('tabindex="0"'), false);
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
    assert.equal(app.includes("const shouldFollowChat = state.pinnedProfileMessageId ? false : state.followingChat || isChatNearBottom()"), true);
    assert.equal(app.includes('class="chat-stack"'), true);
    assert.equal(app.includes("elements.chatFeed.scrollTop = getMaxScrollTop()"), true);
    assert.match(styles, /\.chat-stack\s*\{[^}]*display: flex[^}]*flex-direction: column[^}]*justify-content: flex-end[^}]*min-height: 100%/s);
    assert.match(styles, /\.chat-feed\s*\{[^}]*overflow-y: hidden[^}]*overflow-anchor: none/s);
    assert.match(styles, /\.profile-card\s*\{[^}]*position: fixed[^}]*left: var\(--profile-card-left, 24px\)[^}]*top: var\(--profile-card-top, 24px\)/s);
    assert.match(styles, /\.jump-to-live\s*\{[^}]*position: absolute/s);
    assert.match(styles, /\.jump-to-live\s*\{[^}]*z-index: 100/s);
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

  it("keeps the controlled chat bottom visually fixed without row transform bounce", () => {
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const chatFeedRule = styles.match(/\.chat-feed\s*\{(?<body>[^}]*)\}/s)?.groups.body || "";
    const chatMessageRule = styles.match(/\.chat-message\s*\{(?<body>[^}]*)\}/s)?.groups.body || "";
    const chatRiseKeyframes = styles.match(/@keyframes chat-message-rise\s*\{(?<body>[\s\S]*?)\n\}/)?.groups.body || "";

    assert.match(chatFeedRule, /padding: 0/);
    assert.doesNotMatch(chatMessageRule, /transform-origin/);
    assert.doesNotMatch(chatMessageRule, /transition:[^}]*transform/s);
    assert.doesNotMatch(chatRiseKeyframes, /translateY/);
  });

  it("appends new chat rows without rebuilding the full chat history", () => {
    const app = readAppRuntime();

    assert.equal(app.includes("renderedMessageIds"), true);
    assert.equal(app.includes("function canAppendMessages"), true);
    assert.equal(app.includes("insertAdjacentHTML(\"beforeend\""), true);
    assert.equal(app.includes('elements.chatFeed.innerHTML = `<div class="chat-stack">${state.messages.map(renderMessage).join("")}</div>`'), false);
  });

  it("does not rebuild top source stats during chat-only renders", () => {
    const app = readAppRuntime();

    assert.equal(app.includes("renderedViewerSummaryKey"), true);
    assert.equal(app.includes("function renderViewerSummary()"), true);
    assert.equal(app.includes("function getViewerSummaryKey(viewerSummary)"), true);
    assert.equal(app.includes("if (summaryKey === renderedViewerSummaryKey)"), true);
    assert.equal(app.includes("elements.sourceBreakdown.innerHTML = viewerSummary.sources.map(renderSource).join(\"\")"), true);
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
