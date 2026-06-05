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
      sentiment: "positive",
    });
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
