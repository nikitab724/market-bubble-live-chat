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

  it("subscribes Kick broadcasters to chat message webhooks", async () => {
    const calls = [];
    const client = createKickApiClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: async (url, options = {}) => {
        calls.push({ body: options.body, method: options.method || "GET", url: String(url), options });

        if (String(url).includes("/oauth/token")) {
          return jsonResponse({ access_token: "app-token", expires_in: 3600 });
        }

        assert.equal(options.headers.Authorization, "Bearer app-token");

        if (options.method === "POST") {
          assert.equal(String(url), "https://api.kick.com/public/v1/events/subscriptions");
          assert.deepEqual(JSON.parse(options.body), {
            broadcaster_user_id: 676,
            events: [{ name: "chat.message.sent", version: 1 }],
            method: "webhook",
          });
          return jsonResponse({
            data: [{ name: "chat.message.sent", subscription_id: "sub-1", version: 1 }],
            message: "OK",
          });
        }

        assert.equal(String(url), "https://api.kick.com/public/v1/events/subscriptions");
        return jsonResponse({ data: [] });
      },
    });

    const result = await client.ensureChatEventSubscriptions([
      {
        broadcasterUserId: 676,
        platform: "kick",
        sourceHandle: "xqc",
        sourceId: "kick-xqc",
        sourceLabel: "Xbob",
      },
    ]);

    assert.deepEqual(result, {
      created: [{ broadcasterUserId: 676, sourceHandle: "xqc", subscriptionId: "sub-1" }],
      existing: [],
      skipped: [],
    });
    assert.equal(calls.length, 3);
  });

  it("removes chat webhook subscriptions for dropped broadcasters", async () => {
    const deletes = [];
    const client = createKickApiClient({
      clientId: "client-id",
      clientSecret: "client-secret",
      fetchImpl: async (url, options = {}) => {
        if (String(url).includes("/oauth/token")) {
          return jsonResponse({ access_token: "app-token", expires_in: 3600 });
        }

        assert.equal(options.headers.Authorization, "Bearer app-token");

        if (options.method === "DELETE") {
          deletes.push(String(url));
          return jsonResponse({}, 204);
        }

        assert.equal(String(url), "https://api.kick.com/public/v1/events/subscriptions");
        return jsonResponse({
          data: [
            { broadcaster_user_id: 676, event: "chat.message.sent", id: "sub-xqc", version: 1 },
            { broadcaster_user_id: 81630, event: "chat.message.sent", id: "sub-banks", version: 1 },
            { broadcaster_user_id: 676, event: "livestream.status.updated", id: "sub-xqc-live", version: 1 },
          ],
        });
      },
    });

    const result = await client.removeChatEventSubscriptions([676]);

    assert.deepEqual(result, {
      removed: [{ broadcasterUserId: 676, subscriptionId: "sub-xqc" }],
    });
    assert.deepEqual(deletes, ["https://api.kick.com/public/v1/events/subscriptions?id=sub-xqc"]);
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
