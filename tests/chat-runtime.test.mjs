import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadPublicConfig, loadTwitchEmotes, loadXProfiles, startBackendChatEvents } from "../src/chat-runtime.mjs";

describe("chat runtime public config", () => {
  it("returns sources and the config version from the backend", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ sources: [{ sourceId: "twitch-xqc" }], configVersion: "abc123def456" }),
    });

    const config = await loadPublicConfig({ fetchImpl, fallbackSources: [] });
    assert.deepEqual(config.sources, [{ sourceId: "twitch-xqc" }]);
    assert.equal(config.configVersion, "abc123def456");
  });

  it("falls back to copies of the provided sources when the backend is unavailable", async () => {
    const fallbackSources = [{ sourceId: "twitch-fallback" }];
    const config = await loadPublicConfig({
      fetchImpl: async () => {
        throw new Error("down");
      },
      fallbackSources,
    });

    assert.deepEqual(config.sources, fallbackSources);
    assert.notEqual(config.sources[0], fallbackSources[0]);
    assert.equal(config.configVersion, "");
  });

  it("invokes the config callback for SSE config events", () => {
    const listeners = new Map();
    class FakeEventSource {
      constructor(url) {
        this.url = url;
      }

      addEventListener(name, handler) {
        listeners.set(name, handler);
      }
    }

    const seen = [];
    startBackendChatEvents({
      window: { EventSource: FakeEventSource },
      addBackendMessage: () => {},
      updateBackendChatStatus: () => {},
      onConfigEvent: (payload) => seen.push(payload),
    });

    listeners.get("config")({ data: JSON.stringify({ version: "abc123def456" }) });
    assert.deepEqual(seen, [{ version: "abc123def456" }]);
  });
});

describe("chat runtime emote loading", () => {
  it("loads third-party emote maps for Twitch and Kick sources", async () => {
    const requests = [];
    const fetchImpl = async (url) => {
      requests.push(String(url));
      return {
        ok: true,
        json: async () => ({ emotes: { KEKW: { name: "KEKW", provider: "bttv", url: "https://cdn.betterttv.net/emote/kekw/2x" } } }),
      };
    };
    const state = { twitchEmotes: {} };
    let renders = 0;
    const sources = [
      { enabled: true, platform: "twitch", profileId: "xqc", sourceHandle: "xqc", sourceId: "twitch-xqc" },
      { enabled: true, platform: "kick", profileId: "xqc", sourceHandle: "xqc", sourceId: "kick-xqc" },
      { enabled: true, platform: "kick", profileId: "profile-4", sourceHandle: "nickwhite", sourceId: "kick-nickwhite" },
      { enabled: true, platform: "x", profileId: "banks", sourceHandle: "banks", sourceId: "x-banks" },
    ];

    await loadTwitchEmotes({ fetchImpl, sources, state, queueRender: () => { renders += 1; } });

    assert.deepEqual(Object.keys(state.twitchEmotes).sort(), ["kick-nickwhite", "kick-xqc", "twitch-xqc"]);
    assert.equal(renders, 3);

    // Kick chats reuse the profile-mate Twitch channel's emote map when one
    // exists (same streamer, same emote culture); kick-only profiles fall back
    // to their own handle, which resolves to the global emote sets.
    const channels = requests.map((url) => new URL(url, "http://localhost").searchParams.get("channel")).sort();
    assert.deepEqual(channels, ["nickwhite", "xqc", "xqc"]);
    assert.equal(state.twitchEmotes["kick-xqc"].KEKW.name, "KEKW");
  });

  it("loads X identity profiles for enabled X sources", async () => {
    const requests = [];
    const fetchImpl = async (url) => {
      requests.push(String(url));
      return {
        ok: true,
        json: async () => ({ profile: { followers: 937556, handle: "banks", name: "Banks" } }),
      };
    };
    const state = { xProfiles: {} };
    let renders = 0;
    const sources = [
      { enabled: true, platform: "x", sourceHandle: "Banks", sourceId: "x-banks" },
      { enabled: true, platform: "x", sourceHandle: "z", sourceId: "x-z" },
      { enabled: true, platform: "twitch", sourceHandle: "xqc", sourceId: "twitch-xqc" },
    ];

    await loadXProfiles({ fetchImpl, sources, state, queueRender: () => { renders += 1; } });

    assert.deepEqual(Object.keys(state.xProfiles).sort(), ["banks", "z"]);
    assert.equal(renders, 2);
    assert.deepEqual(
      requests.map((url) => new URL(url, "http://localhost").searchParams.get("handle")).sort(),
      ["banks", "z"],
    );
  });
});
