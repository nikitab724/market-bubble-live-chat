import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createLoginThrottle, hashPassword } from "../src/admin-auth.mjs";
import { createAppServer, getChatRetentionHours } from "../server.mjs";

describe("server contract", () => {
  it("uses two-hour chat retention by default with env overrides", () => {
    assert.equal(getChatRetentionHours({}), 2);
    assert.equal(getChatRetentionHours({ CHAT_RETENTION_HOURS: "4" }), 4);
    assert.equal(getChatRetentionHours({ CHAT_RETENTION_DAYS: "1" }), 24);
  });

  it("opens admin source editing when no admin password hash is configured", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mb-open-admin-"));
    const configPath = join(tempDir, "sources.json");
    await writeFile(
      configPath,
      JSON.stringify({
        sources: [{ platform: "kick", sourceName: "Market Bubble", sourceHandle: "marketbubble" }],
      }),
    );

    const server = createAppServer({
      adminPasswordHash: "",
      configPath,
      rootDir: fileURLToPath(new URL("..", import.meta.url)),
      secureCookies: false,
      twitchChatService: null,
    });
    await listen(server);

    try {
      const adminSources = await request(server, "GET", "/api/admin/sources");
      assert.equal(adminSources.status, 200);
      assert.equal(adminSources.json.sources[0].platform, "kick");

      const update = await request(server, "PUT", "/api/admin/sources", {
        sources: [{ platform: "twitch", sourceName: "Market Bubble", sourceHandle: "marketbubble", viewerCount: 999999 }],
      });
      assert.equal(update.status, 200);
      assert.equal(update.json.sources[0].platform, "twitch");
      assert.equal(update.json.sources[0].viewerCount, 0);

      const login = await request(server, "POST", "/api/admin/login", { password: "" });
      assert.equal(login.status, 204);
    } finally {
      await close(server);
    }
  });

  it("resolves Kick broadcaster user ids when admin sources are saved", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mb-kick-resolve-"));
    const configPath = join(tempDir, "sources.json");
    await writeFile(configPath, JSON.stringify({ sources: [] }));

    const resolvedHandles = [];
    const subscriptionSources = [];
    const server = createAppServer({
      adminPasswordHash: "",
      configPath,
      rootDir: fileURLToPath(new URL("..", import.meta.url)),
      secureCookies: false,
      twitchChatService: null,
      kickClient: {
        async getLiveState() {
          return { providers: { kick: { status: "connected" } }, sources: [] };
        },
        async resolveBroadcasterUserId(handle) {
          resolvedHandles.push(handle);
          return 676;
        },
        async ensureChatEventSubscriptions(sources) {
          subscriptionSources.push(sources);
          return { created: [{ broadcasterUserId: 676, sourceHandle: "xqc", subscriptionId: "sub-1" }] };
        },
      },
    });
    await listen(server);

    try {
      const update = await request(server, "PUT", "/api/admin/sources", {
        sources: [{ platform: "kick", sourceName: "xQc", sourceHandle: "XQC" }],
      });

      assert.equal(update.status, 200);
      assert.equal(update.json.sources[0].sourceHandle, "xqc");
      assert.equal(update.json.sources[0].broadcasterUserId, 676);
      assert.deepEqual(resolvedHandles, ["xqc"]);
      assert.equal(subscriptionSources.length, 1);
      assert.equal(subscriptionSources[0][0].platform, "kick");
      assert.equal(subscriptionSources[0][0].sourceHandle, "xqc");
      assert.equal(subscriptionSources[0][0].broadcasterUserId, 676);

      const saved = JSON.parse(await readFile(configPath, "utf8"));
      assert.equal(saved.sources[0].broadcasterUserId, 676);
    } finally {
      await close(server);
    }
  });

  it("ensures Kick chat subscriptions from existing public config", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mb-kick-public-subscribe-"));
    const configPath = join(tempDir, "sources.json");
    await writeFile(
      configPath,
      JSON.stringify({
        sources: [{
          broadcasterUserId: 676,
          platform: "kick",
          sourceName: "xQc",
          sourceHandle: "xqc",
        }],
      }),
    );

    const subscriptionSources = [];
    const server = createAppServer({
      adminPasswordHash: "",
      configPath,
      rootDir: fileURLToPath(new URL("..", import.meta.url)),
      secureCookies: false,
      twitchChatService: null,
      kickClient: {
        async getLiveState() {
          return { providers: { kick: { status: "connected" } }, sources: [] };
        },
        async resolveBroadcasterUserId() {
          throw new Error("public config should not resolve broadcaster ids");
        },
        async ensureChatEventSubscriptions(sources) {
          subscriptionSources.push(sources);
          return { created: [], existing: [{ broadcasterUserId: 676, sourceHandle: "xqc" }], skipped: [] };
        },
      },
    });
    await listen(server);

    try {
      const publicConfig = await request(server, "GET", "/api/public-config");

      assert.equal(publicConfig.status, 200);
      assert.equal(publicConfig.json.sources[0].sourceHandle, "xqc");
      assert.equal(subscriptionSources.length, 1);
      assert.equal(subscriptionSources[0][0].platform, "kick");
      assert.equal(subscriptionSources[0][0].sourceHandle, "xqc");
      assert.equal(subscriptionSources[0][0].broadcasterUserId, 676);
    } finally {
      await close(server);
    }
  });

  it("syncs server-side Twitch chat connectors from source config", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mb-twitch-chat-sync-"));
    const configPath = join(tempDir, "sources.json");
    await writeFile(
      configPath,
      JSON.stringify({
        sources: [
          { platform: "twitch", sourceName: "xQc", sourceHandle: "xqc" },
          { platform: "kick", sourceName: "xQc", sourceHandle: "xqc" },
        ],
      }),
    );

    const syncedSources = [];
    let stopCount = 0;
    const server = createAppServer({
      adminPasswordHash: "",
      configPath,
      rootDir: fileURLToPath(new URL("..", import.meta.url)),
      secureCookies: false,
      twitchChatService: {
        syncSources(sources) {
          syncedSources.push(sources.filter((source) => source.platform === "twitch").map((source) => source.sourceId));
        },
        stop() {
          stopCount += 1;
        },
      },
    });
    await listen(server);

    try {
      const publicConfig = await request(server, "GET", "/api/public-config");
      assert.equal(publicConfig.status, 200);

      const update = await request(server, "PUT", "/api/admin/sources", {
        sources: [{ platform: "twitch", sourceName: "Hasan", sourceHandle: "hasanabi" }],
      });
      assert.equal(update.status, 200);
    } finally {
      await close(server);
    }

    assert.deepEqual(syncedSources, [["twitch-xqc"], ["twitch-hasanabi"]]);
    assert.equal(stopCount, 1);
  });

  it("writes backend chat events through the configured event store", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mb-chat-event-store-"));
    const configPath = join(tempDir, "sources.json");
    await writeFile(
      configPath,
      JSON.stringify({
        sources: [{ platform: "kick", sourceName: "xQc", sourceHandle: "xqc" }],
      }),
    );

    const storedEvents = [];
    const server = createAppServer({
      adminPasswordHash: "",
      chatEventStore: {
        append(eventName, payload) {
          const event = { id: storedEvents.length + 1, eventName, payload };
          storedEvents.push(event);
          return event;
        },
        close() {},
        getEventsAfter() {
          return [];
        },
        getRecentEvents() {
          return [];
        },
      },
      configPath,
      rootDir: fileURLToPath(new URL("..", import.meta.url)),
      secureCookies: false,
      twitchChatService: null,
    });
    await listen(server);

    try {
      const devKickChat = await request(server, "POST", "/api/dev/kick-chat", {
        author: "Local Tester",
        body: "stored kick",
        handle: "localtester",
        sourceHandle: "xqc",
      });

      assert.equal(devKickChat.status, 200);
    } finally {
      await close(server);
    }

    assert.equal(storedEvents.length, 1);
    assert.equal(storedEvents[0].eventName, "chat");
    assert.equal(storedEvents[0].payload.platform, "kick");
    assert.equal(storedEvents[0].payload.body, "stored kick");
  });

  it("protects admin APIs with a server-side session cookie", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mb-admin-"));
    const configPath = join(tempDir, "sources.json");
    await writeFile(
      configPath,
      JSON.stringify({
        sources: [
          { platform: "twitch", sourceName: "Market Bubble", sourceHandle: "marketbubble" },
          { platform: "kick", sourceName: "Market Bubble", sourceHandle: "marketbubble" },
        ],
      }),
    );

    const server = createAppServer({
      adminPasswordHash: await hashPassword("secret", {
        iterations: 1200,
        salt: "00112233445566778899aabbccddeeff",
      }),
      configPath,
      rootDir: fileURLToPath(new URL("..", import.meta.url)),
      secureCookies: false,
      twitchChatService: null,
      twitchClient: {
        async getLiveState(sources) {
          return {
            providers: { twitch: { status: "connected" } },
            sources: sources
              .filter((source) => source.platform === "twitch")
              .map((source) => ({
                isLive: true,
                platform: "twitch",
                sourceHandle: source.sourceHandle,
                sourceId: source.sourceId,
                sourceLabel: source.sourceLabel,
                title: "Market Bubble Live",
                viewerCount: 4321,
            })),
          };
        },
        async getChatBadges(channel) {
          return {
            badges: {
              "moderator/1": {
                id: "moderator",
                imageUrl: "https://static-cdn.jtvnw.net/badges/mod-2.png",
                label: "Moderator",
                title: "Moderator",
                version: "1",
              },
            },
            channel,
            providers: { twitch: { status: "connected" } },
          };
        },
      },
      xApiClient: {
        async getUserProfile(handle) {
          return {
            avatarUrl: "https://pbs.twimg.com/profile_images/abc/xyz_200x200.jpg",
            bio: "trader. co-host @MarketBubble.",
            followers: 937556,
            handle: String(handle).toLowerCase(),
            name: "Ansem",
            url: `https://x.com/${String(handle).toLowerCase()}`,
            verified: true,
          };
        },
      },
      twitchEmoteClient: {
        async getEmotes(channel) {
          return {
            channel,
            emotes: {
              KEKW: { name: "KEKW", provider: "bttv", url: "https://cdn.betterttv.net/emote/kekw/2x" },
            },
            providers: { bttv: { status: "connected" } },
          };
        },
      },
      kickClient: {
        async getLiveState(sources) {
          return {
            providers: { kick: { status: "connected" } },
            sources: sources
              .filter((source) => source.platform === "kick")
              .map((source) => ({
                isLive: true,
                platform: "kick",
                sourceHandle: source.sourceHandle,
                sourceId: source.sourceId,
                sourceLabel: source.sourceLabel,
                title: "Kick Desk Live",
                viewerCount: 987,
              })),
          };
        },
      },
      kickWebhookVerifier: () => true,
    });
    await listen(server);

    try {
      const publicConfig = await request(server, "GET", "/api/public-config");
      assert.equal(publicConfig.status, 200);
      assert.equal(publicConfig.json.sources[0].sourceId, "twitch-marketbubble");

      const adminProfileModule = await request(server, "GET", "/admin/profile-model.mjs");
      assert.equal(adminProfileModule.status, 200);
      assert.match(adminProfileModule.text, /buildProfilesFromSources/);

      const liveState = await request(server, "GET", "/api/live-state");
      assert.equal(liveState.status, 200);
      assert.deepEqual(liveState.json, {
        providers: { kick: { status: "connected" }, twitch: { status: "connected" }, x: { status: "no_sources" } },
        sources: [
          {
            isLive: true,
            platform: "twitch",
            sourceHandle: "marketbubble",
            sourceId: "twitch-marketbubble",
            sourceLabel: "Market Bubble",
            title: "Market Bubble Live",
            viewerCount: 4321,
          },
          {
            isLive: true,
            platform: "kick",
            sourceHandle: "marketbubble",
            sourceId: "kick-marketbubble",
            sourceLabel: "Market Bubble",
            title: "Kick Desk Live",
            viewerCount: 987,
          },
        ],
      });

      const twitchEmotes = await request(server, "GET", "/api/twitch-emotes?channel=MarketBubble");
      assert.equal(twitchEmotes.status, 200);
      assert.equal(twitchEmotes.json.channel, "MarketBubble");
      assert.equal(twitchEmotes.json.emotes.KEKW.provider, "bttv");

      const twitchBadges = await request(server, "GET", "/api/twitch-badges?channel=MarketBubble");
      assert.equal(twitchBadges.status, 200);
      assert.equal(twitchBadges.json.channel, "MarketBubble");
      assert.equal(twitchBadges.json.badges["moderator/1"].imageUrl, "https://static-cdn.jtvnw.net/badges/mod-2.png");

      const xProfile = await request(server, "GET", "/api/x-profile?handle=blknoiz06");
      assert.equal(xProfile.status, 200);
      assert.equal(xProfile.json.profile.name, "Ansem");
      assert.equal(xProfile.json.profile.followers, 937556);

      const xProfileMissingHandle = await request(server, "GET", "/api/x-profile");
      assert.equal(xProfileMissingHandle.status, 400);

      const webhook = await request(
        server,
        "POST",
        "/api/webhooks/kick",
        {
          message_id: "kick-message-1",
          broadcaster: { username: "Market Bubble", channel_slug: "marketbubble" },
          sender: { username: "RiskOn", channel_slug: "riskon" },
          content: "real kick chat",
          created_at: "2026-06-05T18:00:00Z",
        },
        "",
        {
          "kick-event-type": "chat.message.sent",
          "kick-event-version": "1",
        },
      );
      assert.equal(webhook.status, 204);

      const devKickChat = await request(server, "POST", "/api/dev/kick-chat", {
        author: "Local Tester",
        body: "local kick inject",
        handle: "localtester",
        sourceHandle: "marketbubble",
      });
      assert.equal(devKickChat.status, 200);
      assert.equal(devKickChat.json.message.platform, "kick");
      assert.equal(devKickChat.json.message.body, "local kick inject");

      const privateFile = await request(server, "GET", "/server.mjs");
      assert.equal(privateFile.status, 404);

      const blocked = await request(server, "GET", "/api/admin/sources");
      assert.equal(blocked.status, 401);

      const badLogin = await request(server, "POST", "/api/admin/login", { password: "wrong" });
      assert.equal(badLogin.status, 401);

      const login = await request(server, "POST", "/api/admin/login", { password: "secret" });
      assert.equal(login.status, 204);
      assert.match(login.headers.get("set-cookie"), /mb_admin=/);
      assert.match(login.headers.get("set-cookie"), /HttpOnly/);
      assert.match(login.headers.get("set-cookie"), /SameSite=Strict/);

      const cookie = login.headers.get("set-cookie").split(";")[0];
      const adminSources = await request(server, "GET", "/api/admin/sources", null, cookie);
      assert.equal(adminSources.status, 200);
      assert.equal(adminSources.json.sources[0].platform, "twitch");

      const update = await request(
        server,
        "PUT",
        "/api/admin/sources",
        {
          sources: [
            { platform: "twitch", sourceName: "Market Bubble", sourceHandle: "marketbubble" },
            {
              platform: "x",
              sourceName: "Banks",
              sourceHandle: "Banks",
              conversationId: "2062574325970973093",
              viewerCount: 999999,
            },
          ],
        },
        cookie,
      );
      assert.equal(update.status, 200);
      assert.equal(update.json.sources.length, 2);

      const saved = JSON.parse(await readFile(configPath, "utf8"));
      assert.equal(saved.sources[1].sourceId, "x-banks");
      assert.equal(saved.sources[1].viewerCount, 0);
    } finally {
      await close(server);
    }
  });

  it("merges X connector occupancy into /api/live-state", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mb-x-live-"));
    const configPath = join(tempDir, "sources.json");
    await writeFile(
      configPath,
      JSON.stringify({
        sources: [
          { platform: "x", sourceName: "Banks", sourceHandle: "banks", broadcastId: "1yKAPPboWlDxb" },
        ],
      }),
    );

    const server = createAppServer({
      configPath,
      rootDir: fileURLToPath(new URL("..", import.meta.url)),
      secureCookies: false,
      twitchChatService: null,
      twitchClient: {
        async getLiveState() {
          return { providers: { twitch: { status: "no_sources" } }, sources: [] };
        },
      },
      kickClient: {
        async getLiveState() {
          return { providers: { kick: { status: "no_sources" } }, sources: [] };
        },
      },
      xChatService: {
        syncSources() {},
        stop() {},
        getLiveState() {
          return {
            providers: { x: { status: "connected" } },
            sources: [
              {
                isLive: true,
                platform: "x",
                sourceHandle: "banks",
                sourceId: "x-banks",
                sourceLabel: "Banks",
                viewerCount: 108,
              },
            ],
          };
        },
      },
    });
    await listen(server);

    try {
      const liveState = await request(server, "GET", "/api/live-state");
      assert.equal(liveState.status, 200);
      assert.deepEqual(liveState.json.providers.x, { status: "connected" });
      assert.deepEqual(liveState.json.sources, [
        {
          isLive: true,
          platform: "x",
          sourceHandle: "banks",
          sourceId: "x-banks",
          sourceLabel: "Banks",
          viewerCount: 108,
        },
      ]);
    } finally {
      await close(server);
    }
  });

  it("sets an X source broadcast id from the extension bridge and syncs the connector", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mb-x-broadcast-"));
    const configPath = join(tempDir, "sources.json");
    await writeFile(
      configPath,
      JSON.stringify({ sources: [{ platform: "x", sourceHandle: "banks", sourceLabel: "Banks", enabled: true }] }),
    );

    const syncedBroadcastIds = [];
    const server = createAppServer({
      adminPasswordHash: "",
      configPath,
      rootDir: fileURLToPath(new URL("..", import.meta.url)),
      secureCookies: false,
      twitchChatService: null,
      xChatService: {
        syncSources(sources) {
          const x = sources.find((source) => source.platform === "x" && source.sourceHandle === "banks");
          syncedBroadcastIds.push(x?.broadcastId);
        },
        stop() {},
      },
    });
    await listen(server);

    try {
      // A pasted /i/broadcasts/<id> URL is normalized down to the bare id.
      const set = await request(server, "POST", "/api/x-broadcast", {
        sourceHandle: "banks",
        broadcastId: "https://x.com/i/broadcasts/1yKAPPboWlDxb",
      });
      assert.equal(set.status, 200);
      assert.equal(set.json.ok, true);
      assert.equal(set.json.broadcastId, "1yKAPPboWlDxb");
      assert.equal(set.json.sourceId, "x-banks");

      const saved = JSON.parse(await readFile(configPath, "utf8"));
      assert.equal(saved.sources[0].broadcastId, "1yKAPPboWlDxb");
      assert.deepEqual(syncedBroadcastIds, ["1yKAPPboWlDxb"]);

      // Re-reporting the same id is idempotent and does not re-sync.
      const repeat = await request(server, "POST", "/api/x-broadcast", {
        sourceHandle: "banks",
        broadcastId: "1yKAPPboWlDxb",
      });
      assert.equal(repeat.status, 200);
      assert.deepEqual(syncedBroadcastIds, ["1yKAPPboWlDxb"]);

      // Unknown handle and invalid id are rejected.
      const unknown = await request(server, "POST", "/api/x-broadcast", { sourceHandle: "nobody", broadcastId: "1abc" });
      assert.equal(unknown.status, 404);
      const invalid = await request(server, "POST", "/api/x-broadcast", { sourceHandle: "banks", broadcastId: "not a broadcast" });
      assert.equal(invalid.status, 400);
    } finally {
      await close(server);
    }
  });

  it("ignores extension DOM-bridge chat for an X source owned by the server-side connector", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mb-x-dedupe-"));
    const configPath = join(tempDir, "sources.json");
    await writeFile(
      configPath,
      JSON.stringify({ sources: [{ platform: "x", sourceHandle: "banks", sourceLabel: "Banks", enabled: true }] }),
    );

    const chatEvents = [];
    const server = createAppServer({
      adminPasswordHash: "",
      configPath,
      rootDir: fileURLToPath(new URL("..", import.meta.url)),
      secureCookies: false,
      twitchChatService: null,
      xChatService: { syncSources() {}, stop() {} },
      chatHub: {
        broadcast(eventName, payload) {
          chatEvents.push({ eventName, payload });
        },
        connect() {},
      },
    });
    await listen(server);

    try {
      const post = () => request(server, "POST", "/api/x-chat", { sourceHandle: "banks", author: "Nuckelx", handle: "nuckelx", body: "hello" });

      // No broadcast id yet: the DOM bridge is the only path, so it is delivered.
      assert.equal((await post()).status, 204);
      assert.equal(chatEvents.filter((e) => e.eventName === "chat").length, 1);

      // Once a broadcast id is set, the source is owned by the server-side
      // connector and the DOM-bridge post is ignored (no second delivery).
      assert.equal((await request(server, "POST", "/api/x-broadcast", { sourceHandle: "banks", broadcastId: "1yKAPPboWlDxb" })).status, 200);
      assert.equal((await post()).status, 204);
      assert.equal(chatEvents.filter((e) => e.eventName === "chat").length, 1);
    } finally {
      await close(server);
    }
  });

  it("gates X ingest routes behind the admin ingest token when a password is configured", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mb-x-gate-"));
    const configPath = join(tempDir, "sources.json");
    await writeFile(
      configPath,
      JSON.stringify({ sources: [{ platform: "x", sourceHandle: "banks", sourceLabel: "Banks", enabled: true }] }),
    );

    const chatEvents = [];
    const server = createAppServer({
      adminPasswordHash: await hashPassword("secret", { iterations: 1200, salt: "00112233445566778899aabbccddeeff" }),
      configPath,
      rootDir: fileURLToPath(new URL("..", import.meta.url)),
      secureCookies: false,
      twitchChatService: null,
      xChatService: { syncSources() {}, stop() {} },
      chatHub: {
        broadcast(eventName, payload) {
          chatEvents.push({ eventName, payload });
        },
        connect() {},
      },
    });
    await listen(server);

    try {
      // Anonymous ingest is rejected once a password is configured.
      const anonChat = await request(server, "POST", "/api/x-chat", { sourceHandle: "banks", author: "Spoofer", handle: "spoofer", body: "fake" });
      assert.equal(anonChat.status, 401);
      const anonBroadcast = await request(server, "POST", "/api/x-broadcast", { sourceHandle: "banks", broadcastId: "1yKAPPboWlDxb" });
      assert.equal(anonBroadcast.status, 401);
      assert.equal(chatEvents.filter((e) => e.eventName === "chat").length, 0);

      // The ingest token is only reachable behind a valid admin session.
      const tokenBlocked = await request(server, "GET", "/api/admin/x-ingest-token");
      assert.equal(tokenBlocked.status, 401);

      const login = await request(server, "POST", "/api/admin/login", { password: "secret" });
      assert.equal(login.status, 204);
      const cookie = login.headers.get("set-cookie").split(";")[0];

      const tokenResponse = await request(server, "GET", "/api/admin/x-ingest-token", null, cookie);
      assert.equal(tokenResponse.status, 200);
      const token = tokenResponse.json.token;
      assert.equal(typeof token, "string");
      assert.equal(token.length >= 32, true);

      // A wrong token is still rejected.
      const wrongToken = await request(server, "POST", "/api/x-chat", { sourceHandle: "banks", author: "Spoofer", handle: "spoofer", body: "fake" }, "", { authorization: "Bearer not-the-token" });
      assert.equal(wrongToken.status, 401);

      // The minted token authorizes both ingest routes.
      const okChat = await request(server, "POST", "/api/x-chat", { sourceHandle: "banks", author: "Nuckelx", handle: "nuckelx", body: "hello" }, "", { authorization: `Bearer ${token}` });
      assert.equal(okChat.status, 204);
      assert.equal(chatEvents.filter((e) => e.eventName === "chat").length, 1);

      const okBroadcast = await request(server, "POST", "/api/x-broadcast", { sourceHandle: "banks", broadcastId: "1yKAPPboWlDxb" }, "", { authorization: `Bearer ${token}` });
      assert.equal(okBroadcast.status, 200);
    } finally {
      await close(server);
    }
  });

  it("locks out repeated failed admin logins", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mb-login-throttle-"));
    const configPath = join(tempDir, "sources.json");
    await writeFile(configPath, JSON.stringify({ sources: [] }));

    const server = createAppServer({
      adminPasswordHash: await hashPassword("secret", { iterations: 1200, salt: "00112233445566778899aabbccddeeff" }),
      configPath,
      loginThrottle: createLoginThrottle({ maxAttempts: 2, lockoutMs: 60_000 }),
      rootDir: fileURLToPath(new URL("..", import.meta.url)),
      secureCookies: false,
      twitchChatService: null,
      xChatService: null,
    });
    await listen(server);

    try {
      assert.equal((await request(server, "POST", "/api/admin/login", { password: "wrong" })).status, 401);
      assert.equal((await request(server, "POST", "/api/admin/login", { password: "wrong" })).status, 401);

      // The client is now locked out — even the correct password is refused.
      const locked = await request(server, "POST", "/api/admin/login", { password: "secret" });
      assert.equal(locked.status, 429);
      assert.equal(Number(locked.headers.get("retry-after")) > 0, true);
    } finally {
      await close(server);
    }
  });
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function request(server, method, path, body, cookie = "", headers = {}) {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();

  return {
    headers: response.headers,
    json: isJson(response) && text ? JSON.parse(text) : null,
    status: response.status,
    text,
  };
}

function isJson(response) {
  return response.headers.get("content-type")?.includes("application/json");
}
