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

  it("fetches recent Twitch archive VODs for a channel", async () => {
    const client = createTwitchApiClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: async (url, options = {}) => {
        if (String(url).includes("/oauth2/token")) {
          return jsonResponse({ access_token: "app-token", expires_in: 3600 });
        }

        if (String(url) === "https://api.twitch.tv/helix/users?login=fazebanks") {
          return jsonResponse({ data: [{ id: "789", login: "fazebanks" }] });
        }

        assert.equal(options.headers.Authorization, "Bearer app-token");
        assert.match(String(url), /^https:\/\/api\.twitch\.tv\/helix\/videos\?/);
        return jsonResponse({
          data: [
            {
              created_at: "2026-06-08T18:00:00Z",
              duration: "2h15m30s",
              id: "vod-1",
              thumbnail_url: "https://thumb/%{width}x%{height}.jpg",
              title: "Market Bubble VOD",
              url: "https://www.twitch.tv/videos/vod-1",
            },
          ],
        });
      },
    });

    assert.deepEqual(await client.getVods("fazebanks", 15), [
      {
        duration: "2h15m30s",
        id: "vod-1",
        published: "2026-06-08",
        thumbnail: "https://thumb/1280x720.jpg",
        title: "Market Bubble VOD",
        url: "https://www.twitch.tv/videos/vod-1",
      },
    ]);
    assert.deepEqual(await client.getLatestVod("fazebanks"), {
      duration: "2h15m30s",
      id: "vod-1",
      title: "Market Bubble VOD",
    });
  });

  it("fetches global and channel Twitch chat badges as a keyed image map", async () => {
    const calls = [];
    const client = createTwitchApiClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: async (url, options = {}) => {
        calls.push(String(url));

        if (String(url).includes("/oauth2/token")) {
          return jsonResponse({ access_token: "app-token", expires_in: 3600 });
        }

        assert.equal(options.headers["Client-Id"], "client-id");
        assert.equal(options.headers.Authorization, "Bearer app-token");

        if (String(url) === "https://api.twitch.tv/helix/users?login=marketbubble") {
          return jsonResponse({ data: [{ id: "456", login: "marketbubble" }] });
        }

        if (String(url) === "https://api.twitch.tv/helix/chat/badges/global") {
          return jsonResponse({
            data: [
              {
                set_id: "moderator",
                versions: [
                  {
                    id: "1",
                    image_url_1x: "https://static-cdn.jtvnw.net/badges/mod-1.png",
                    image_url_2x: "https://static-cdn.jtvnw.net/badges/mod-2.png",
                    title: "Moderator",
                  },
                ],
              },
            ],
          });
        }

        assert.equal(String(url), "https://api.twitch.tv/helix/chat/badges?broadcaster_id=456");
        return jsonResponse({
          data: [
            {
              set_id: "subscriber",
              versions: [
                {
                  id: "12",
                  image_url_1x: "https://static-cdn.jtvnw.net/badges/sub-1.png",
                  image_url_2x: "https://static-cdn.jtvnw.net/badges/sub-2.png",
                  title: "12-Month Subscriber",
                },
              ],
            },
          ],
        });
      },
    });

    assert.deepEqual(await client.getChatBadges("MarketBubble"), {
      badges: {
        "moderator/1": {
          id: "moderator",
          imageUrl: "https://static-cdn.jtvnw.net/badges/mod-2.png",
          label: "Moderator",
          title: "Moderator",
          version: "1",
        },
        "subscriber/12": {
          id: "subscriber",
          imageUrl: "https://static-cdn.jtvnw.net/badges/sub-2.png",
          label: "Subscriber",
          title: "12-Month Subscriber",
          version: "12",
        },
      },
      channel: "MarketBubble",
      providers: { twitch: { status: "connected" } },
    });
    assert.deepEqual(calls, [
      "https://id.twitch.tv/oauth2/token",
      "https://api.twitch.tv/helix/users?login=marketbubble",
      "https://api.twitch.tv/helix/chat/badges/global",
      "https://api.twitch.tv/helix/chat/badges?broadcaster_id=456",
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
