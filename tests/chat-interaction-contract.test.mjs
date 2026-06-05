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
    assert.equal(html.includes('id="viewerCount"'), true);
    assert.equal(html.includes('id="sourceBreakdown"'), true);
  });

  it("does not keep profile cards open through row focus", () => {
    const app = readFileSync(new URL("../src/app.mjs", import.meta.url), "utf8");
    const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

    assert.equal(app.includes('class="chat-message" tabindex="0"'), false);
    assert.equal(app.includes('addEventListener("focusin"'), false);
    assert.equal(app.includes('addEventListener("focusout"'), false);
    assert.equal(styles.includes(".chat-message:focus"), false);
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
    assert.equal(app.includes("startBackendChatEvents"), true);
    assert.equal(app.includes("addBackendMessage"), true);
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
});
