import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildChatSocketUrl,
  buildChatSubscribeFrames,
  createXApiClient,
  extractBroadcastId,
  getSourceBroadcastId,
  normalizeXBroadcastMessage,
} from "../src/x-api.mjs";

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  };
}

function buildChatFrame(inner, { sender } = {}) {
  return {
    kind: 1,
    payload: JSON.stringify({
      body: JSON.stringify(inner),
      kind: 1,
      ...(sender ? { sender } : {}),
    }),
  };
}

describe("x-api broadcast id extraction", () => {
  it("extracts a broadcast id from an /i/broadcasts/ URL", () => {
    assert.equal(extractBroadcastId("https://x.com/i/broadcasts/1ynKOZkXVagGR"), "1ynKOZkXVagGR");
    assert.equal(extractBroadcastId("https://twitter.com/i/broadcasts/1ynKOZkXVagGR?foo=1"), "1ynKOZkXVagGR");
  });

  it("accepts a bare broadcast id and rejects junk", () => {
    assert.equal(extractBroadcastId("1ynKOZkXVagGR"), "1ynKOZkXVagGR");
    assert.throws(() => extractBroadcastId(""), /required/);
    assert.throws(() => extractBroadcastId("not a broadcast"), /Could not extract/);
  });

  it("resolves a source broadcast id only from explicit fields, not numeric post ids", () => {
    assert.equal(getSourceBroadcastId({ broadcastId: "1abcDEF" }), "1abcDEF");
    assert.equal(getSourceBroadcastId({ sourceUrl: "https://x.com/i/broadcasts/1abcDEF" }), "1abcDEF");
    assert.equal(getSourceBroadcastId({ conversationId: "https://x.com/i/broadcasts/1abcDEF" }), "1abcDEF");
    // A numeric post id in conversationId is not a broadcast id.
    assert.equal(getSourceBroadcastId({ conversationId: "2062574325970973093" }), "");
    assert.equal(getSourceBroadcastId({}), "");
  });
});

describe("x-api bootstrap handshake", () => {
  it("walks guest token -> show -> live status -> accessChatPublic and returns the chat endpoint", async () => {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url, init });

      if (url.includes("guest/activate.json")) {
        return jsonResponse({ guest_token: "guest-123" });
      }
      if (url.includes("broadcasts/show.json")) {
        return jsonResponse({ broadcasts: { "1abc": { media_key: "mk-9", state: "RUNNING" } } });
      }
      if (url.includes("live_video_stream/status")) {
        return jsonResponse({ chatToken: "chat-token-xyz" });
      }
      if (url.includes("accessChatPublic")) {
        return jsonResponse({ access_token: "access-abc", endpoint: "https://prod-chatman-ancillary-eu-central-1.pscp.tv", read_only: true });
      }
      throw new Error(`unexpected url ${url}`);
    };

    const client = createXApiClient({ fetchImpl });
    const bootstrap = await client.bootstrapBroadcast("https://x.com/i/broadcasts/1abc");

    assert.equal(bootstrap.broadcastId, "1abc");
    assert.equal(bootstrap.mediaKey, "mk-9");
    assert.equal(bootstrap.chatToken, "chat-token-xyz");
    assert.equal(bootstrap.accessToken, "access-abc");
    assert.equal(bootstrap.endpoint, "https://prod-chatman-ancillary-eu-central-1.pscp.tv");
    assert.equal(bootstrap.isLive, true);
    assert.equal(bootstrap.url, "https://x.com/i/broadcasts/1abc");

    // guest token is forwarded to the broadcast/show and live-status calls
    const showCall = calls.find((call) => call.url.includes("broadcasts/show.json"));
    assert.equal(showCall.init.headers["x-guest-token"], "guest-123");
    assert.match(showCall.init.headers.authorization, /^Bearer /);

    const accessCall = calls.find((call) => call.url.includes("accessChatPublic"));
    assert.equal(accessCall.init.method, "POST");
    assert.deepEqual(JSON.parse(accessCall.init.body), { chat_token: "chat-token-xyz" });
  });

  it("throws when a broadcast has no media key", async () => {
    const fetchImpl = async (url) => {
      if (url.includes("guest/activate.json")) return jsonResponse({ guest_token: "g" });
      if (url.includes("broadcasts/show.json")) return jsonResponse({ broadcasts: {} });
      throw new Error(`unexpected ${url}`);
    };

    const client = createXApiClient({ fetchImpl });
    await assert.rejects(() => client.bootstrapBroadcast("1abc"), /No media_key/);
  });
});

describe("x-api chat socket framing", () => {
  it("builds a ws chatnow URL from the https endpoint", () => {
    assert.equal(
      buildChatSocketUrl("https://prod-chatman-eu.pscp.tv/"),
      "wss://prod-chatman-eu.pscp.tv/chatapi/v1/chatnow",
    );
  });

  it("builds auth and room-join subscribe frames", () => {
    const frames = buildChatSubscribeFrames({ accessToken: "tok", broadcastId: "1abc" });
    assert.equal(frames.length, 2);

    const auth = JSON.parse(frames[0]);
    assert.equal(auth.kind, 3);
    assert.deepEqual(JSON.parse(auth.payload), { access_token: "tok" });

    const join = JSON.parse(frames[1]);
    assert.equal(join.kind, 2);
    const joinPayload = JSON.parse(join.payload);
    assert.deepEqual(JSON.parse(joinPayload.body), { room: "1abc" });
  });
});

describe("x-api message normalization", () => {
  const source = {
    sourceId: "x-banks",
    sourceName: "Banks",
    sourceHandle: "banks",
    sourceLabel: "Banks",
  };

  it("normalizes a triple-encoded chat frame into the shared chat shape", () => {
    const frame = buildChatFrame({
      body: "  send it  ",
      username: "trader_joe",
      displayName: "Trader Joe",
      uuid: "uuid-1",
      timestamp: 1700000000000,
    });

    const message = normalizeXBroadcastMessage(frame, source);
    assert.equal(message.id, "x-uuid-1");
    assert.equal(message.platform, "x");
    assert.equal(message.author, "Trader Joe");
    assert.equal(message.handle, "trader_joe");
    assert.equal(message.body, "send it");
    assert.equal(message.sourceId, "x-banks");
    assert.equal(message.sourceLabel, "Banks");
    assert.equal(message.sourceUrl, "https://x.com/trader_joe");
    assert.equal(message.timestamp, new Date(1700000000000).toISOString());
  });

  it("falls back to sender identity and a synthesized uuid", () => {
    const frame = buildChatFrame(
      { body: "gm", timestamp: 1700000000000 },
      { sender: { username: "anon", display_name: "Anon" } },
    );

    const message = normalizeXBroadcastMessage(frame, source);
    assert.equal(message.author, "Anon");
    assert.equal(message.handle, "anon");
    assert.equal(message.id, "x-x-banks:anon:1700000000000:gm");
  });

  it("rejects non-chat frames and empty bodies", () => {
    assert.equal(normalizeXBroadcastMessage({ kind: 2, payload: "{}" }, source), null);
    assert.equal(normalizeXBroadcastMessage(buildChatFrame({ body: "   ", username: "a" }), source), null);
    assert.equal(normalizeXBroadcastMessage({ kind: 1 }, source), null);
    assert.equal(normalizeXBroadcastMessage(null, source), null);
  });

  it("clamps microsecond timestamps to milliseconds", () => {
    const frame = buildChatFrame({ body: "hi", username: "a", uuid: "u", timestamp: 1700000000000000 });
    const message = normalizeXBroadcastMessage(frame, source);
    assert.equal(message.timestamp, new Date(1700000000000).toISOString());
  });
});
