import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { hashPassword } from "../src/admin-auth.mjs";
import { createAppServer } from "../server.mjs";

describe("server contract", () => {
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
        providers: { kick: { status: "connected" }, twitch: { status: "connected" } },
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
