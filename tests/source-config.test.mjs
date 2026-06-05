import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_SOURCES,
  normalizeSources,
  toPublicConfig,
} from "../src/source-config.mjs";

describe("source config", () => {
  it("normalizes editable source rows for all supported platforms", () => {
    const sources = normalizeSources([
      { platform: "twitch", sourceHandle: "MarketBubble", viewerCount: "3000" },
      { platform: "kick", sourceHandle: "marketbubble", sourceName: "Market Bubble", viewerCount: 1200 },
      {
        platform: "x",
        sourceName: "Banks",
        sourceHandle: "Banks",
        conversationId: "2062574325970973093",
        viewerCount: 8000,
      },
      { platform: "room", sourceName: "MarketBubble.com", sourceHandle: "marketbubble", viewerCount: 500 },
    ]);

    assert.deepEqual(
      sources.map((source) => ({
        sourceId: source.sourceId,
        platform: source.platform,
        sourceName: source.sourceName,
        sourceHandle: source.sourceHandle,
        sourceLabel: source.sourceLabel,
        conversationId: source.conversationId,
        viewerCount: source.viewerCount,
        enabled: source.enabled,
      })),
      [
        {
          sourceId: "twitch-marketbubble",
          platform: "twitch",
          sourceName: "MarketBubble",
          sourceHandle: "marketbubble",
          sourceLabel: "MarketBubble",
          conversationId: "",
          viewerCount: 3000,
          enabled: true,
        },
        {
          sourceId: "kick-marketbubble",
          platform: "kick",
          sourceName: "Market Bubble",
          sourceHandle: "marketbubble",
          sourceLabel: "Market Bubble",
          conversationId: "",
          viewerCount: 1200,
          enabled: true,
        },
        {
          sourceId: "x-banks",
          platform: "x",
          sourceName: "Banks",
          sourceHandle: "banks",
          sourceLabel: "Banks",
          conversationId: "2062574325970973093",
          viewerCount: 8000,
          enabled: true,
        },
        {
          sourceId: "room-marketbubble",
          platform: "room",
          sourceName: "MarketBubble.com",
          sourceHandle: "marketbubble",
          sourceLabel: "MarketBubble.com",
          conversationId: "",
          viewerCount: 500,
          enabled: true,
        },
      ],
    );
  });

  it("rejects unsupported platforms and blank handles", () => {
    assert.throws(
      () => normalizeSources([{ platform: "youtube", sourceHandle: "marketbubble" }]),
      /Unsupported platform: youtube/,
    );
    assert.throws(
      () => normalizeSources([{ platform: "twitch", sourceHandle: "" }]),
      /Source handle is required/,
    );
  });

  it("projects only public fields for the browser", () => {
    const publicConfig = toPublicConfig(
      normalizeSources([
        {
          platform: "x",
          sourceName: "Banks",
          sourceHandle: "Banks",
          conversationId: "2062574325970973093",
          accessToken: "secret-token",
        },
      ]),
    );

    assert.deepEqual(publicConfig, {
      sources: [
        {
          enabled: true,
          platform: "x",
          sourceHandle: "banks",
          sourceId: "x-banks",
          sourceLabel: "Banks",
          sourceName: "Banks",
          sourceUrl: "https://x.com/banks",
          viewerCount: 0,
        },
      ],
    });
  });

  it("keeps the default config focused on the requested platforms", () => {
    assert.deepEqual(
      DEFAULT_SOURCES.map((source) => source.platform),
      ["twitch", "kick", "x", "x", "room"],
    );
  });
});
