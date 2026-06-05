import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createTwitchEmoteClient } from "../src/twitch-emotes.mjs";

describe("twitch emote client", () => {
  it("combines BTTV, FFZ, and 7TV global and channel emotes", async () => {
    const requestedUrls = [];
    const client = createTwitchEmoteClient({
      fetchImpl: async (url) => {
        requestedUrls.push(String(url));

        if (String(url) === "https://api.betterttv.net/3/cached/emotes/global") {
          return jsonResponse([{ code: "OMEGALUL", id: "bttv-global" }]);
        }

        if (String(url) === "https://api.betterttv.net/3/cached/users/twitch/123") {
          return jsonResponse({
            channelEmotes: [{ code: "RONNY", id: "bttv-channel" }],
            sharedEmotes: [{ code: "SHARED", id: "bttv-shared" }],
          });
        }

        if (String(url) === "https://api.frankerfacez.com/v1/set/global") {
          return jsonResponse({
            sets: {
              "1": {
                emoticons: [{ name: "PepeHands", urls: { 2: "//cdn.frankerfacez.com/emote/1/2" } }],
              },
            },
          });
        }

        if (String(url) === "https://api.frankerfacez.com/v1/room/stableronaldo") {
          return jsonResponse({
            sets: {
              "2": {
                emoticons: [{ name: "RonSmirk", urls: { 2: "https://cdn.frankerfacez.com/emote/2/2" } }],
              },
            },
          });
        }

        if (String(url) === "https://7tv.io/v3/emote-sets/global") {
          return jsonResponse({
            emotes: [
              {
                data: { host: { url: "//cdn.7tv.app/emote/global" } },
                name: "xdd",
              },
            ],
          });
        }

        if (String(url) === "https://7tv.io/v3/users/twitch/123") {
          return jsonResponse({
            emote_set: {
              emotes: [
                {
                  data: { host: { url: "//cdn.7tv.app/emote/channel" } },
                  name: "Aware",
                },
              ],
            },
          });
        }

        throw new Error(`Unexpected URL: ${url}`);
      },
      twitchClient: {
        async getUserId(channel) {
          assert.equal(channel, "stableronaldo");
          return "123";
        },
      },
    });

    const result = await client.getEmotes("stableronaldo");

    assert.deepEqual(Object.keys(result.emotes), ["Aware", "xdd", "RONNY", "SHARED", "OMEGALUL", "RonSmirk", "PepeHands"]);
    assert.equal(result.emotes.Aware.provider, "7TV");
    assert.equal(result.emotes.OMEGALUL.url, "https://cdn.betterttv.net/emote/bttv-global/2x");
    assert.equal(result.emotes.PepeHands.url, "https://cdn.frankerfacez.com/emote/1/2");
    assert.equal(result.providers.seventv.status, "connected");
    assert.equal(result.providers.bttv.status, "connected");
    assert.equal(result.providers.ffz.status, "connected");
    assert.equal(requestedUrls.length, 6);
  });
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}
