import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadTwitchEmotes } from "../src/chat-runtime.mjs";

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
});
