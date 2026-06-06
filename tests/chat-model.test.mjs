import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAuthorProfile,
  buildPlatformStats,
  buildViewerSummary,
  mergeMessages,
  normalizeMessage,
} from "../src/chat-model.mjs";

describe("chat model", () => {
  it("normalizes platform messages into the dashboard shape", () => {
    const message = normalizeMessage({
      platform: "twitch",
      author: "ChartLad",
      handle: "chartlad",
      body: "banks is cooking",
      timestamp: "2026-06-05T03:00:00.000Z",
      sourceUrl: "https://twitch.tv/marketbubble",
      sourceId: "twitch-marketbubble",
      sourceName: "Market Bubble",
      sourceHandle: "marketbubble",
    });

    assert.deepEqual(message, {
      id: "twitch-twitch-marketbubble-chartlad-2026-06-05t03-00-00-000z-banks-is-cooking",
      platform: "twitch",
      author: "ChartLad",
      handle: "chartlad",
      body: "banks is cooking",
      timestamp: "2026-06-05T03:00:00.000Z",
      sourceUrl: "https://twitch.tv/marketbubble",
      sourceId: "twitch-marketbubble",
      sourceName: "Market Bubble",
      sourceHandle: "marketbubble",
      sourceLabel: "Market Bubble",
      avatar: "C",
      sentiment: "positive",
    });
  });

  it("merges messages oldest first so new chat renders at the bottom", () => {
    const messages = mergeMessages([
      { platform: "x", author: "MacroMax", body: "x reply", timestamp: "2026-06-05T03:00:00.000Z" },
      { platform: "kick", author: "RiskOn", body: "kick msg", timestamp: "2026-06-05T03:02:00.000Z" },
      { platform: "twitch", author: "TapeReader", body: "twitch msg", timestamp: "2026-06-05T03:01:00.000Z" },
    ]);

    assert.deepEqual(messages.map((message) => message.platform), ["x", "twitch", "kick"]);
  });

  it("dedupes backend messages by id", () => {
    const messages = mergeMessages([
      { id: "kick-message-1", platform: "kick", author: "A", body: "same", timestamp: "2026-06-05T03:00:00.000Z" },
      { id: "kick-message-1", platform: "kick", author: "A", body: "same", timestamp: "2026-06-05T03:00:00.000Z" },
    ]);

    assert.equal(messages.length, 1);
    assert.equal(messages[0].id, "kick-message-1");
  });

  it("preserves renderable emote metadata on messages", () => {
    const message = normalizeMessage({
      platform: "twitch",
      author: "ChartLad",
      body: "Kappa",
      timestamp: "2026-06-05T03:00:00.000Z",
      emotes: [
        {
          end: 4,
          name: "Kappa",
          provider: "twitch",
          start: 0,
          url: "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0",
        },
      ],
    });

    assert.deepEqual(message.emotes, [
      {
        end: 4,
        name: "Kappa",
        provider: "twitch",
        start: 0,
        url: "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0",
      },
    ]);
  });

  it("counts active chatters and messages by platform", () => {
    const messages = mergeMessages([
      { platform: "twitch", author: "A", body: "one", timestamp: "2026-06-05T03:00:00.000Z" },
      { platform: "twitch", author: "A", body: "two", timestamp: "2026-06-05T03:01:00.000Z" },
      { platform: "kick", author: "B", body: "three", timestamp: "2026-06-05T03:02:00.000Z" },
      { platform: "x", author: "C", body: "four", timestamp: "2026-06-05T03:03:00.000Z" },
      { platform: "room", author: "D", body: "five", timestamp: "2026-06-05T03:04:00.000Z" },
    ]);

    assert.deepEqual(buildPlatformStats(messages), {
      twitch: { activeChatters: 1, messages: 2 },
      kick: { activeChatters: 1, messages: 1 },
      x: { activeChatters: 1, messages: 1 },
      room: { activeChatters: 1, messages: 1 },
    });
  });

  it("builds full profile details for a message author", () => {
    const messages = mergeMessages([
      {
        platform: "x",
        author: "MacroMax",
        handle: "macro_max_full",
        body: "one",
        timestamp: "2026-06-05T03:00:00.000Z",
        sourceUrl: "https://x.com/macro_max_full",
        sourceId: "x-banks",
        sourceName: "Banks",
        sourceHandle: "banks",
      },
      {
        platform: "x",
        author: "MacroMax",
        handle: "macro_max_full",
        body: "two",
        timestamp: "2026-06-05T03:02:00.000Z",
        sourceUrl: "https://x.com/macro_max_full",
        sourceId: "x-banks",
        sourceName: "Banks",
        sourceHandle: "banks",
      },
      {
        platform: "kick",
        author: "MacroMax",
        handle: "macro_max_full",
        body: "different platform",
        timestamp: "2026-06-05T03:03:00.000Z",
        sourceUrl: "https://kick.com/macro_max_full",
      },
    ]);

    assert.deepEqual(buildAuthorProfile(messages, messages[1]), {
      platform: "x",
      author: "MacroMax",
      handle: "macro_max_full",
      displayHandle: "@macro_max_full",
      sourceUrl: "https://x.com/macro_max_full",
      sourceId: "x-banks",
      sourceName: "Banks",
      sourceHandle: "banks",
      sourceLabel: "Banks",
      messageCount: 2,
      lastSeen: "2026-06-05T03:02:00.000Z",
    });
  });

  it("builds a combined viewer total across platform stream sources", () => {
    const summary = buildViewerSummary([
      {
        platform: "twitch",
        sourceId: "twitch-marketbubble",
        sourceName: "Market Bubble",
        sourceHandle: "marketbubble",
        viewerCount: 3184,
      },
      {
        platform: "kick",
        sourceId: "kick-marketbubble",
        sourceName: "Market Bubble",
        sourceHandle: "marketbubble",
        viewerCount: 1260,
      },
      {
        platform: "x",
        sourceId: "x-banks",
        sourceName: "Banks",
        sourceHandle: "banks",
        viewerCount: 8062,
      },
      {
        platform: "x",
        sourceId: "x-z",
        sourceName: "Z",
        sourceHandle: "z",
        viewerCount: 4720,
      },
      {
        platform: "room",
        sourceId: "room-marketbubble",
        sourceName: "MarketBubble.com",
        viewerCount: 518,
      },
    ]);

    assert.equal(summary.total, 17744);
    assert.deepEqual(
      summary.sources.map((source) => `${source.platform}:${source.sourceName}:${source.viewerCount}`),
      [
        "twitch:Market Bubble:3184",
        "kick:Market Bubble:1260",
        "x:Banks:8062",
        "x:Z:4720",
        "room:MarketBubble.com:518",
      ],
    );
  });
});
