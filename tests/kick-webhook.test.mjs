import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { describe, it } from "node:test";

import {
  normalizeKickChatWebhook,
  verifyKickWebhookSignature,
} from "../src/kick-webhook.mjs";

describe("kick webhook", () => {
  it("normalizes chat.message.sent payloads into the shared chat shape", () => {
    const message = normalizeKickChatWebhook({
      payload: {
        message_id: "unique_message_id_123",
        broadcaster: {
          username: "Market Bubble",
          channel_slug: "marketbubble",
        },
        sender: {
          username: "sender_name",
          channel_slug: "sender_channel",
          profile_picture: "https://kick-avatar.jpg",
          identity: {
            badges: [
              { text: "Moderator", type: "moderator" },
              { count: 5, text: "Sub Gifter", type: "sub_gifter" },
              { count: 3, text: "Subscriber", type: "subscriber" },
            ],
            username_color: "#FF5733",
          },
        },
        content: "Hello [emote:4148074:HYPERCLAP] [emote:37226:KEKW]",
        created_at: "2026-06-05T18:00:00Z",
      },
      sources: [
        {
          platform: "kick",
          sourceHandle: "marketbubble",
          sourceId: "kick-marketbubble",
          sourceLabel: "Market Bubble",
          sourceName: "Market Bubble",
          sourceUrl: "https://kick.com/marketbubble",
        },
      ],
    });

    assert.deepEqual(message, {
      id: "kick-unique_message_id_123",
      platform: "kick",
      author: "sender_name",
      handle: "sender_channel",
      body: "Hello HYPERCLAP KEKW",
      timestamp: "2026-06-05T18:00:00.000Z",
      sourceUrl: "https://kick.com/sender_channel",
      sourceId: "kick-marketbubble",
      sourceName: "Market Bubble",
      sourceHandle: "marketbubble",
      sourceLabel: "Market Bubble",
      avatar: "S",
      authorColor: "#FF5733",
      badges: [
        { id: "moderator", label: "Moderator", title: "Moderator", version: "" },
        { count: 5, id: "sub_gifter", label: "Sub Gifter", title: "Sub Gifter · 5", version: "" },
        { count: 3, id: "subscriber", label: "Subscriber", title: "Subscriber · 3", version: "" },
      ],
      sentiment: "positive",
      emotes: [
        { end: 14, name: "HYPERCLAP", provider: "kick", start: 6, url: "https://files.kick.com/emotes/4148074/fullsize" },
        { end: 19, name: "KEKW", provider: "kick", start: 16, url: "https://files.kick.com/emotes/37226/fullsize" },
      ],
    });
  });

  it("keeps Kick emote positions aligned with the trimmed body", () => {
    const message = normalizeKickChatWebhook({
      payload: {
        message_id: "m2",
        broadcaster: { username: "Market Bubble", channel_slug: "marketbubble" },
        sender: { username: "sender_name", channel_slug: "sender_channel" },
        content: "  [emote:37226:KEKW] hi  ",
        created_at: "2026-06-05T18:00:00Z",
      },
      sources: [
        {
          platform: "kick",
          sourceHandle: "marketbubble",
          sourceId: "kick-marketbubble",
          sourceLabel: "Market Bubble",
          sourceName: "Market Bubble",
          sourceUrl: "https://kick.com/marketbubble",
        },
      ],
    });

    assert.equal(message.body, "KEKW hi");
    assert.deepEqual(message.emotes, [
      { end: 3, name: "KEKW", provider: "kick", start: 0, url: "https://files.kick.com/emotes/37226/fullsize" },
    ]);
  });

  it("matches the webhook broadcaster by resolved broadcaster user id before slug", () => {
    const message = normalizeKickChatWebhook({
      payload: {
        message_id: "m3",
        broadcaster: { user_id: 81630, username: "BanksKick", channel_slug: "fazebanks" },
        sender: { username: "viewer_one", channel_slug: "viewer_one" },
        content: "hello banks",
        created_at: "2026-06-11T18:00:00Z",
      },
      sources: [
        {
          broadcasterUserId: 110326750,
          platform: "kick",
          sourceHandle: "ansem",
          sourceId: "kick-ansem",
          sourceLabel: "Ansem",
          sourceName: "Ansem",
        },
        {
          broadcasterUserId: 81630,
          platform: "kick",
          sourceHandle: "banks",
          sourceId: "kick-banks",
          sourceLabel: "Banks",
          sourceName: "Banks",
        },
      ],
    });

    assert.equal(message.sourceId, "kick-banks");
    assert.equal(message.sourceLabel, "Banks");
  });

  it("drops webhooks for broadcasters that match no configured Kick source", () => {
    const message = normalizeKickChatWebhook({
      payload: {
        message_id: "m4",
        broadcaster: { user_id: 676, username: "xQc", channel_slug: "xqc" },
        sender: { username: "foreign_viewer", channel_slug: "foreign_viewer" },
        content: "foreign chat",
        created_at: "2026-06-11T18:00:00Z",
      },
      sources: [
        {
          broadcasterUserId: 81630,
          platform: "kick",
          sourceHandle: "banks",
          sourceId: "kick-banks",
          sourceLabel: "Banks",
          sourceName: "Banks",
        },
      ],
    });

    assert.equal(message, null);
  });

  it("drops webhooks when no Kick sources are configured", () => {
    const message = normalizeKickChatWebhook({
      payload: {
        message_id: "m5",
        broadcaster: { user_id: 676, username: "xQc", channel_slug: "xqc" },
        sender: { username: "foreign_viewer", channel_slug: "foreign_viewer" },
        content: "foreign chat",
        created_at: "2026-06-11T18:00:00Z",
      },
      sources: [{ platform: "twitch", sourceHandle: "marketbubble", sourceId: "twitch-marketbubble" }],
    });

    assert.equal(message, null);
  });

  it("verifies Kick webhook signatures over message id, timestamp, and raw body", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const rawBody = JSON.stringify({ content: "hello" });
    const headers = {
      "kick-event-message-id": "message-1",
      "kick-event-message-timestamp": "2026-06-05T18:00:00Z",
    };
    const signedBody = `${headers["kick-event-message-id"]}.${headers["kick-event-message-timestamp"]}.${rawBody}`;
    headers["kick-event-signature"] = sign("RSA-SHA256", Buffer.from(signedBody), privateKey).toString("base64");

    assert.equal(verifyKickWebhookSignature({ headers, publicKey, rawBody }), true);
    assert.equal(verifyKickWebhookSignature({ headers, publicKey, rawBody: "{}" }), false);
  });
});
