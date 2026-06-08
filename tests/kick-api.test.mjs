import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createKickApiClient } from "../src/kick-api.mjs";

describe("kick api client", () => {
  it("reports not_configured without credentials", async () => {
    const calls = [];
    const client = createKickApiClient({
      clientId: "",
      clientSecret: "",
      fetchImpl: async (url) => {
        calls.push(url);
        throw new Error("should not fetch");
      },
    });

    const state = await client.getLiveState([{ platform: "kick", sourceHandle: "marketbubble" }]);

    assert.equal(state.providers.kick.status, "not_configured");
    assert.deepEqual(state.sources, []);
    assert.deepEqual(calls, []);
  });

  it("fetches live Kick channel state with an app access token", async () => {
    const calls = [];
    const client = createKickApiClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      now: () => 1_000,
      fetchImpl: async (url, options = {}) => {
        calls.push({ url: String(url), options });

        if (String(url).includes("/oauth/token")) {
          return jsonResponse({
            access_token: "app-token",
            expires_in: 3600,
            token_type: "Bearer",
          });
        }

        assert.equal(options.headers.Authorization, "Bearer app-token");
        assert.equal(String(url), "https://api.kick.com/public/v1/channels?slug=marketbubble");
        return jsonResponse({
          data: [
            {
              broadcaster_user_id: 123,
              category: { name: "Just Chatting" },
              slug: "marketbubble",
              stream: {
                is_live: true,
                start_time: "2026-06-05T18:00:00Z",
                thumbnail: "https://kick-thumbnail.jpg",
                viewer_count: 2222,
              },
              stream_title: "Market Bubble Live",
            },
          ],
          message: "OK",
        });
      },
    });

    const state = await client.getLiveState([
      {
        platform: "kick",
        sourceHandle: "marketbubble",
        sourceId: "kick-marketbubble",
        sourceLabel: "Market Bubble",
      },
    ]);

    assert.equal(state.providers.kick.status, "connected");
    assert.deepEqual(state.sources, [
      {
        broadcasterUserId: 123,
        gameName: "Just Chatting",
        isLive: true,
        platform: "kick",
        sourceHandle: "marketbubble",
        sourceId: "kick-marketbubble",
        sourceLabel: "Market Bubble",
        startedAt: "2026-06-05T18:00:00Z",
        thumbnailUrl: "https://kick-thumbnail.jpg",
        title: "Market Bubble Live",
        viewerCount: 2222,
      },
    ]);
    assert.equal(calls.length, 2);
  });

  it("resolves a Kick broadcaster user id from a channel handle", async () => {
    const calls = [];
    const client = createKickApiClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: async (url, options = {}) => {
        calls.push({ url: String(url), options });

        if (String(url).includes("/oauth/token")) {
          return jsonResponse({ access_token: "app-token", expires_in: 3600 });
        }

        assert.equal(options.headers.Authorization, "Bearer app-token");
        assert.equal(String(url), "https://api.kick.com/public/v1/channels?slug=xqc");
        return jsonResponse({
          data: [
            {
              broadcaster_user_id: 676,
              slug: "xqc",
              stream: null,
            },
          ],
        });
      },
    });

    const broadcasterUserId = await client.resolveBroadcasterUserId("XQC");

    assert.equal(broadcasterUserId, 676);
    assert.equal(calls.length, 2);
  });

  it("returns offline Kick sources when the channel has no stream", async () => {
    const client = createKickApiClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: async (url) => {
        if (String(url).includes("/oauth/token")) {
          return jsonResponse({ access_token: "app-token", expires_in: 3600 });
        }

        return jsonResponse({
          data: [{ slug: "marketbubble", stream: null, stream_title: "" }],
        });
      },
    });

    const state = await client.getLiveState([
      {
        platform: "kick",
        sourceHandle: "marketbubble",
        sourceId: "kick-marketbubble",
        sourceLabel: "Market Bubble",
      },
    ]);

    assert.equal(state.providers.kick.status, "connected");
    assert.deepEqual(state.sources, [
      {
        isLive: false,
        platform: "kick",
        sourceHandle: "marketbubble",
        sourceId: "kick-marketbubble",
        sourceLabel: "Market Bubble",
        viewerCount: 0,
      },
    ]);
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
