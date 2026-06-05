import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createTwitchApiClient } from "../src/twitch-api.mjs";

describe("twitch api client", () => {
  it("reports not_configured without credentials", async () => {
    const calls = [];
    const client = createTwitchApiClient({
      clientId: "",
      clientSecret: "",
      fetchImpl: async (url) => {
        calls.push(url);
        throw new Error("should not fetch");
      },
    });

    const state = await client.getLiveState([{ platform: "twitch", sourceHandle: "marketbubble" }]);

    assert.equal(state.providers.twitch.status, "not_configured");
    assert.deepEqual(state.sources, []);
    assert.deepEqual(calls, []);
  });

  it("fetches live Twitch stream state with an app access token", async () => {
    const calls = [];
    const client = createTwitchApiClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      now: () => 1_000,
      fetchImpl: async (url, options = {}) => {
        calls.push({ url: String(url), options });

        if (String(url).includes("/oauth2/token")) {
          return jsonResponse({
            access_token: "app-token",
            expires_in: 3600,
            token_type: "bearer",
          });
        }

        assert.equal(options.headers["Client-Id"], "client-id");
        assert.equal(options.headers.Authorization, "Bearer app-token");
        assert.equal(String(url), "https://api.twitch.tv/helix/streams?user_login=marketbubble");
        return jsonResponse({
          data: [
            {
              game_name: "Just Chatting",
              id: "stream-1",
              started_at: "2026-06-05T18:00:00Z",
              thumbnail_url: "https://thumb/{width}x{height}.jpg",
              title: "Market Bubble Live",
              type: "live",
              user_login: "marketbubble",
              viewer_count: 4321,
            },
          ],
        });
      },
    });

    const state = await client.getLiveState([
      {
        platform: "twitch",
        sourceHandle: "marketbubble",
        sourceId: "twitch-marketbubble",
        sourceLabel: "Market Bubble",
      },
    ]);

    assert.equal(state.providers.twitch.status, "connected");
    assert.deepEqual(state.sources, [
      {
        gameName: "Just Chatting",
        isLive: true,
        platform: "twitch",
        sourceHandle: "marketbubble",
        sourceId: "twitch-marketbubble",
        sourceLabel: "Market Bubble",
        startedAt: "2026-06-05T18:00:00Z",
        streamId: "stream-1",
        thumbnailUrl: "https://thumb/{width}x{height}.jpg",
        title: "Market Bubble Live",
        viewerCount: 4321,
      },
    ]);
    assert.equal(calls.length, 2);
  });

  it("returns offline Twitch sources when Helix omits them", async () => {
    const client = createTwitchApiClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: async (url) => {
        if (String(url).includes("/oauth2/token")) {
          return jsonResponse({ access_token: "app-token", expires_in: 3600 });
        }

        return jsonResponse({ data: [] });
      },
    });

    const state = await client.getLiveState([
      {
        platform: "twitch",
        sourceHandle: "marketbubble",
        sourceId: "twitch-marketbubble",
        sourceLabel: "Market Bubble",
      },
    ]);

    assert.equal(state.providers.twitch.status, "connected");
    assert.deepEqual(state.sources, [
      {
        isLive: false,
        platform: "twitch",
        sourceHandle: "marketbubble",
        sourceId: "twitch-marketbubble",
        sourceLabel: "Market Bubble",
        viewerCount: 0,
      },
    ]);
  });

  it("resolves Twitch user IDs by login for third-party emote lookups", async () => {
    const client = createTwitchApiClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: async (url, options = {}) => {
        if (String(url).includes("/oauth2/token")) {
          return jsonResponse({ access_token: "app-token", expires_in: 3600 });
        }

        assert.equal(options.headers["Client-Id"], "client-id");
        assert.equal(options.headers.Authorization, "Bearer app-token");
        assert.equal(String(url), "https://api.twitch.tv/helix/users?login=stableronaldo");
        return jsonResponse({ data: [{ id: "123", login: "stableronaldo" }] });
      },
    });

    assert.equal(await client.getUserId("StableRonaldo"), "123");
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
