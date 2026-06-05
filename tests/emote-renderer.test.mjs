import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderMessageBody } from "../src/emote-renderer.mjs";

describe("emote renderer", () => {
  it("renders native Twitch emotes by range and third-party emotes by token", () => {
    const html = renderMessageBody(
      {
        body: "Kappa <bad> KEKW",
        emotes: [
          {
            end: 4,
            name: "Kappa",
            provider: "twitch",
            start: 0,
            url: "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0",
          },
        ],
        platform: "twitch",
      },
      {
        KEKW: {
          name: "KEKW",
          provider: "bttv",
          url: "https://cdn.betterttv.net/emote/kekw/2x",
        },
      },
    );

    assert.equal(
      html,
      '<img class="chat-emote twitch-emote" src="https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0" alt="Kappa" title="Kappa · Twitch" loading="lazy" decoding="async" /> &lt;bad&gt; <img class="chat-emote bttv-emote" src="https://cdn.betterttv.net/emote/kekw/2x" alt="KEKW" title="KEKW · BTTV" loading="lazy" decoding="async" />',
    );
  });

  it("escapes non-Twitch messages without emote replacement", () => {
    assert.equal(renderMessageBody({ body: "<hello> KEKW", platform: "x" }, {}), "&lt;hello&gt; KEKW");
  });
});
