import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("chat interaction contract", () => {
  it("renders the hosted viewer page with stream and chat", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

    assert.equal(html.includes("stream-view"), true);
    assert.equal(html.includes("video-frame"), true);
    assert.equal(html.includes("Market Bubble stream"), true);
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
    const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(app.includes('class="chat-message" tabindex="0"'), false);
    assert.equal(app.includes('addEventListener("focusin"'), false);
    assert.equal(app.includes('addEventListener("focusout"'), false);
    assert.equal(styles.includes(".chat-message:focus"), false);
    assert.equal(app.includes("pendingChatRender"), true);
    assert.equal(app.includes("if (state.inspectingProfile)"), true);
    assert.equal(app.includes("state.pendingChatRender = true"), true);
    assert.equal(app.includes("state.pendingChatRender = false"), true);
    assert.equal(app.includes("renderChatFeed"), true);
    assert.match(styles, /\.profile-card\s*\{[^}]*display: none/s);
    assert.match(styles, /\.chat-message:hover\s+\.profile-card,\s*\.profile-card:hover\s*\{[^}]*display: block/s);
  });

  it("does not render user profile picture placeholders in chat rows", () => {
    const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(app.includes('class="avatar'), false);
    assert.equal(styles.includes(".avatar"), false);
  });

  it("uses the Market Bubble broadcast treatment with platform color accents", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");

    assert.equal(html.includes("broadcast-clock"), true);
    assert.equal(html.includes("MarketBubble.com"), true);
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
    const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");

    assert.equal(app.includes("/api/public-config"), true);
    assert.equal(app.includes("fallbackSources"), true);
    assert.equal(app.includes("loadPublicConfig"), true);
  });

  it("refreshes live stream state from the backend", () => {
    const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");

    assert.equal(app.includes("/api/live-state"), true);
    assert.equal(app.includes("refreshLiveState"), true);
    assert.equal(app.includes("viewerCountLocked"), true);
    assert.equal(app.includes('source.platform === "twitch" && source.viewerCountLocked'), false);
  });

  it("listens for backend chat events", () => {
    const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");

    assert.equal(app.includes('new EventSource("/api/chat-events")'), true);
    assert.equal(app.includes("/api/chat-events/recent"), false);
    assert.equal(app.includes("pollBackendChatEvents"), false);
    assert.equal(app.includes("startBackendChatEvents"), true);
    assert.equal(app.includes("addBackendMessage"), true);
  });

  it("keeps every chat message received during the viewer session", () => {
    const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");

    assert.equal(app.includes("MAX_CHAT_MESSAGES"), false);
    assert.equal(app.includes(".slice(0, 60)"), false);
    assert.equal(app.includes("keepRecentMessages"), false);
    assert.equal(app.includes(".slice(-MAX_CHAT_MESSAGES)"), false);
  });

  it("keeps the chat viewport pinned to the newest bottom messages until the viewer scrolls up", () => {
    const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(app.includes("scrollChatToBottom"), true);
    assert.equal(app.includes("isChatAtBottom"), true);
    assert.equal(app.includes("handleChatScroll"), true);
    assert.equal(app.includes("jumpToLive"), true);
    assert.equal(app.includes("followingChat: true"), true);
    assert.equal(app.includes("state.followingChat = false"), true);
    assert.equal(app.includes("state.followingChat = true"), true);
    assert.equal(app.includes("const shouldFollowChat = state.followingChat || isChatAtBottom()"), true);
    assert.equal(app.includes('class="chat-stack"'), true);
    assert.equal(app.includes("elements.chatFeed.scrollTop = elements.chatFeed.scrollHeight"), true);
    assert.match(styles, /\.chat-stack\s*\{[^}]*display: flex[^}]*flex-direction: column[^}]*justify-content: flex-end[^}]*min-height: 100%/s);
    assert.match(styles, /\.chat-feed\s*\{[^}]*overflow-y: auto[^}]*overflow-anchor: none/s);
    assert.match(styles, /\.jump-to-live\s*\{[^}]*position: absolute/s);
    assert.match(styles, /\.jump-to-live\[hidden\]\s*\{[^}]*display: none/s);
  });

  it("coalesces bursty chat updates while keeping native scrolling locked down", () => {
    const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(app.includes("CHAT_RENDER_INTERVAL_MS = 80"), true);
    assert.equal(app.includes("function queueRender"), true);
    assert.equal(app.includes("function flushQueuedRender"), true);
    assert.equal(app.includes("queuedRenderFrame"), true);
    assert.equal(app.includes("queuedScrollFrame"), true);
    assert.equal(app.includes("window.cancelAnimationFrame(queuedScrollFrame)"), true);
    assert.match(styles, /\.chat-feed\s*\{[^}]*overflow-y: auto[^}]*overflow-anchor: none/s);
  });

  it("appends new chat rows without rebuilding the full chat history", () => {
    const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");

    assert.equal(app.includes("renderedMessageIds"), true);
    assert.equal(app.includes("function canAppendMessages"), true);
    assert.equal(app.includes("insertAdjacentHTML(\"beforeend\""), true);
    assert.equal(app.includes('elements.chatFeed.innerHTML = `<div class="chat-stack">${state.messages.map(renderMessage).join("")}</div>`'), false);
  });

  it("ingests chronological chat messages without remerging the full history", () => {
    const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");

    assert.equal(app.includes("knownMessageIds"), true);
    assert.equal(app.includes("function addMessage"), true);
    assert.equal(app.includes("state.messages.push(message)"), true);
    assert.doesNotMatch(app, /state\.messages = mergeMessages\(\[\s*\.\.\.state\.messages,\s*normalizeMessage\(rawMessage\),\s*\]\);/);
  });

  it("loads and renders Twitch emotes", () => {
    const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(app.includes("/api/twitch-emotes"), true);
    assert.equal(app.includes("loadTwitchEmotes"), true);
    assert.equal(app.includes("renderMessageBody"), true);
    assert.equal(app.includes("escapeHtml(message.body)"), false);
    assert.equal(styles.includes(".chat-emote"), true);
  });

  it("does not expose manual viewer count editing or fake viewer movement", () => {
    const admin = readFileSync(new URL("../admin/admin.mjs", import.meta.url), "utf8");
    const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");

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
    assert.equal(styles.includes(".profile-editor-card"), true);
    assert.equal(styles.includes(".profile-social-grid"), true);
    assert.equal(styles.includes(".profile-editor-body[hidden]"), true);
    assert.equal(styles.includes(".profile-toggle-icon"), true);
  });
});
