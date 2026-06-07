import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

function readRepoFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertRepoFile(path) {
  const exists = existsSync(new URL(`../${path}`, import.meta.url));
  assert.equal(exists, true, `${path} should exist`);
}

describe("architecture contract", () => {
  it("uses a Vite React Tailwind frontend without moving backend provider logic into the UI", () => {
    assertRepoFile("package.json");
    assertRepoFile("vite.config.mjs");
    assertRepoFile("src/ui/main.jsx");
    assertRepoFile("src/ui/ViewerApp.jsx");
    assertRepoFile("src/ui/tailwind.css");

    const pkg = JSON.parse(readRepoFile("package.json"));
    const vite = readRepoFile("vite.config.mjs");
    const main = readRepoFile("src/ui/main.jsx");
    const viewer = readRepoFile("src/ui/ViewerApp.jsx");

    assert.equal(pkg.type, "module");
    assert.equal(pkg.scripts.build, "vite build");
    assert.equal(pkg.scripts.test, "node --test tests/*.test.mjs");
    assert.equal(Boolean(pkg.dependencies.react), true);
    assert.equal(Boolean(pkg.dependencies["react-dom"]), true);
    assert.equal(Boolean(pkg.devDependencies.vite), true);
    assert.equal(Boolean(pkg.devDependencies.tailwindcss), true);
    assert.equal(Boolean(pkg.devDependencies["@tailwindcss/vite"]), true);
    assert.equal(Boolean(pkg.devDependencies["@vitejs/plugin-react"]), true);
    assert.equal(vite.includes("@vitejs/plugin-react"), true);
    assert.equal(vite.includes("@tailwindcss/vite"), true);
    assert.equal(vite.includes('outDir: "dist/client"'), true);
    assert.equal(vite.includes("chat/index.html"), true);
    assert.equal(vite.includes("admin/index.html"), true);
    assert.equal(main.includes("createRoot"), true);
    assert.equal(main.includes("dataset.surface"), true);
    assert.equal(viewer.includes("mountLiveApp"), true);
    assert.equal(viewer.includes("streamPlayer"), true);
    assert.equal(viewer.includes("chatFeed"), true);
  });

  it("keeps the browser app entry thin by splitting stream, chat runtime, and renderer modules", () => {
    assertRepoFile("src/viewer-stream.mjs");
    assertRepoFile("src/chat-runtime.mjs");
    assertRepoFile("src/chat-renderer.mjs");
    assertRepoFile("src/demo-chat.mjs");

    const app = readRepoFile("src/app.mjs");

    assert.equal(app.includes("./viewer-stream.mjs"), true);
    assert.equal(app.includes("./chat-runtime.mjs"), true);
    assert.equal(app.includes("./chat-renderer.mjs"), true);
    assert.equal(app.includes("./demo-chat.mjs"), true);
    assert.equal(app.includes("export function mountLiveApp"), true);
    assert.equal(app.includes("function initStreamPlayer"), false);
    assert.equal(app.includes("function renderChatFeed"), false);
    assert.equal(app.includes("function renderMessage"), false);
  });

  it("keeps demo chat behind an explicit local opt-in", () => {
    assertRepoFile("src/demo-chat.mjs");

    const app = readRepoFile("src/app.mjs");
    const demoChat = readRepoFile("src/demo-chat.mjs");

    assert.equal(app.includes("isDemoChatEnabled"), true);
    assert.match(app, /demoChat/);
    assert.equal(app.includes("window.setInterval(() =>"), false);
    assert.equal(demoChat.includes("scriptedMessages"), true);
    assert.equal(demoChat.includes("livePool"), true);
  });

  it("lets the X extension store the backend URL instead of hardcoding every request site", () => {
    const content = readRepoFile("extension/content.js");
    const popup = readRepoFile("extension/popup.js");
    const popupHtml = readRepoFile("extension/popup.html");

    assert.equal(content.includes("getBackendBaseUrl"), true);
    assert.equal(content.includes("chrome.storage.local.get"), true);
    assert.equal(content.includes("buildBackendUrl"), true);
    assert.equal(popup.includes("chrome.storage.local.set"), true);
    assert.equal(popup.includes("backendUrlInput"), true);
    assert.equal(popupHtml.includes('id="backendUrlInput"'), true);
    assert.equal(popup.includes("/api/public-config"), true);
    assert.equal(content.includes("https://marketbubble.192-210-192-116.sslip.io/api/x-chat"), false);
    assert.equal(popup.includes("https://marketbubble.192-210-192-116.sslip.io/api/public-config"), false);
  });
});
