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
      {
        platform: "kick",
        broadcasterUserId: 676,
        sourceHandle: "marketbubble",
        sourceName: "Market Bubble",
        showStream: true,
        viewerCount: 1200,
      },
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
        broadcasterUserId: source.broadcasterUserId,
        viewerCount: source.viewerCount,
        enabled: source.enabled,
        showStream: source.showStream,
      })),
      [
        {
          sourceId: "twitch-marketbubble",
          platform: "twitch",
          sourceName: "MarketBubble",
          sourceHandle: "marketbubble",
          sourceLabel: "MarketBubble",
          conversationId: "",
          broadcasterUserId: undefined,
          viewerCount: 3000,
          enabled: true,
          showStream: false,
        },
        {
          sourceId: "kick-marketbubble",
          platform: "kick",
          sourceName: "Market Bubble",
          sourceHandle: "marketbubble",
          sourceLabel: "Market Bubble",
          conversationId: "",
          broadcasterUserId: 676,
          viewerCount: 1200,
          enabled: true,
          showStream: true,
        },
        {
          sourceId: "x-banks",
          platform: "x",
          sourceName: "Banks",
          sourceHandle: "banks",
          sourceLabel: "Banks",
          conversationId: "2062574325970973093",
          broadcasterUserId: undefined,
          viewerCount: 8000,
          enabled: true,
          showStream: false,
        },
        {
          sourceId: "room-marketbubble",
          platform: "room",
          sourceName: "MarketBubble.com",
          sourceHandle: "marketbubble",
          sourceLabel: "MarketBubble.com",
          conversationId: "",
          broadcasterUserId: undefined,
          viewerCount: 500,
          enabled: true,
          showStream: false,
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

  it("normalizes an X broadcast id from a field or broadcasts URL but keeps it server-side", () => {
    const [fromField, fromUrl, numericOnly] = normalizeSources([
      { platform: "x", sourceHandle: "banks", broadcastId: "1ynKOZkXVagGR" },
      { platform: "x", sourceHandle: "z", broadcastId: "https://x.com/i/broadcasts/1abcDEF" },
      { platform: "x", sourceHandle: "ace", broadcastId: "not a broadcast" },
    ]);

    assert.equal(fromField.broadcastId, "1ynKOZkXVagGR");
    assert.equal(fromUrl.broadcastId, "1abcDEF");
    assert.equal("broadcastId" in numericOnly, false);

    const publicConfig = toPublicConfig([{ platform: "x", sourceHandle: "banks", broadcastId: "1ynKOZkXVagGR" }]);
    assert.equal("broadcastId" in publicConfig.sources[0], false);
  });

  it("projects only public fields for the browser", () => {
    const publicConfig = toPublicConfig(
      normalizeSources([
        {
          platform: "x",
          profileId: "banks",
          profileName: "Banks",
          sourceName: "Banks",
          sourceHandle: "Banks",
          conversationId: "2062574325970973093",
          showStream: true,
          accessToken: "secret-token",
        },
      ]),
    );

    assert.deepEqual(publicConfig, {
      sources: [
        {
          enabled: true,
          platform: "x",
          profileId: "banks",
          profileName: "Banks",
          sourceHandle: "banks",
          sourceId: "x-banks",
          sourceLabel: "Banks",
          sourceName: "Banks",
          sourceUrl: "https://x.com/banks",
          conversationId: "2062574325970973093",
          showStream: true,
          viewerCount: 0,
        },
      ],
    });
  });

  it("keeps one enabled livestream source selected", () => {
    const sources = normalizeSources([
      { platform: "kick", sourceHandle: "marketbubble", showStream: true },
      { platform: "twitch", sourceHandle: "marketbubble", showStream: true },
      { platform: "x", enabled: false, sourceHandle: "banks", showStream: true },
    ]);

    assert.deepEqual(
      sources.map((source) => ({ platform: source.platform, showStream: source.showStream })),
      [
        { platform: "kick", showStream: true },
        { platform: "twitch", showStream: false },
        { platform: "x", showStream: false },
      ],
    );
  });

  it("projects profile metadata for public source hover cards", () => {
    const [source] = normalizeSources([
      {
        platform: "kick",
        profileId: "market-bubble",
        profileName: "Market Bubble",
        sourceName: "Kick Desk",
        sourceHandle: "marketbubble",
      },
    ]);

    assert.equal(source.profileId, "market-bubble");
    assert.equal(source.profileName, "Market Bubble");
    assert.equal(toPublicConfig([source]).sources[0].profileId, "market-bubble");
    assert.equal(toPublicConfig([source]).sources[0].profileName, "Market Bubble");
  });

  it("keeps the default config focused on the requested platforms", () => {
    assert.deepEqual(
      DEFAULT_SOURCES.map((source) => source.platform),
      ["twitch", "kick", "x", "x", "room"],
    );
  });
});
