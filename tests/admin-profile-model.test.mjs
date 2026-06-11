import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildProfilesFromSources,
  buildSourcesFromProfiles,
  createEmptyProfile,
} from "../admin/profile-model.mjs";

describe("admin profile model", () => {
  it("groups stream sources into editable profiles by profile id or shared handle", () => {
    const profiles = buildProfilesFromSources([
      {
        enabled: true,
        platform: "twitch",
        profileId: "xqc",
        profileName: "xQc",
        sourceHandle: "xqc",
        sourceLabel: "Xtwin",
        sourceName: "Xtwin",
        showStream: true,
      },
      {
        enabled: true,
        platform: "kick",
        profileId: "xqc",
        profileName: "xQc",
        broadcasterUserId: 676,
        sourceHandle: "xqc",
        sourceLabel: "Xbob",
        sourceName: "Xbob",
      },
      {
        enabled: true,
        platform: "x",
        sourceHandle: "banks",
        sourceLabel: "Banks",
        sourceName: "Banks",
        conversationId: "2062574325970973093",
      },
    ]);

    assert.equal(profiles.length, 2);
    assert.equal(profiles[0].id, "xqc");
    assert.equal(profiles[0].name, "xQc");
    assert.equal(profiles[0].sources.twitch.handle, "xqc");
    assert.equal(profiles[0].sources.twitch.label, "Xtwin");
    assert.equal(profiles[0].sources.twitch.showStream, true);
    assert.equal(profiles[0].sources.kick.handle, "xqc");
    assert.equal(profiles[0].sources.kick.label, "Xbob");
    assert.equal(profiles[0].sources.kick.broadcasterUserId, "676");
    assert.equal(profiles[0].sources.kick.showStream, false);
    assert.equal(profiles[1].id, "banks");
    assert.equal(profiles[1].sources.x.conversationId, "2062574325970973093");
  });

  it("round-trips an X broadcast id through profile editing", () => {
    const [profile] = buildProfilesFromSources([
      {
        enabled: true,
        platform: "x",
        sourceHandle: "banks",
        sourceLabel: "Banks",
        sourceName: "Banks",
        broadcastId: "1yKAPPboWlDxb",
      },
    ]);
    assert.equal(profile.sources.x.broadcastId, "1yKAPPboWlDxb");

    const [source] = buildSourcesFromProfiles([
      {
        id: "banks",
        name: "Banks",
        sources: { x: { enabled: true, handle: "banks", label: "Banks", broadcastId: "1yKAPPboWlDxb" } },
      },
    ]);
    assert.equal(source.broadcastId, "1yKAPPboWlDxb");

    const [noId] = buildSourcesFromProfiles([
      { id: "z", name: "Z", sources: { x: { enabled: true, handle: "z", label: "Z" } } },
    ]);
    assert.equal("broadcastId" in noId, false);
  });

  it("collects expanded profile data back into source rows", () => {
    const sources = buildSourcesFromProfiles([
      {
        id: "market-bubble",
        name: "Market Bubble",
        sources: {
          twitch: { enabled: true, handle: "marketbubble", label: "Twitch Desk" },
          kick: {
            broadcasterUserId: "676",
            enabled: false,
            handle: "marketbubble",
            label: "Kick Desk",
            showStream: true,
          },
          x: { enabled: true, handle: "MarketBubble", label: "X Desk", conversationId: "123" },
        },
      },
    ]);

    assert.deepEqual(
      sources.map((source) => ({
        enabled: source.enabled,
        platform: source.platform,
        profileId: source.profileId,
        profileName: source.profileName,
        sourceHandle: source.sourceHandle,
        sourceLabel: source.sourceLabel,
        sourceName: source.sourceName,
        broadcasterUserId: source.broadcasterUserId,
        conversationId: source.conversationId,
        showStream: source.showStream,
      })),
      [
        {
          enabled: true,
          platform: "twitch",
          profileId: "market-bubble",
          profileName: "Market Bubble",
          sourceHandle: "marketbubble",
          sourceLabel: "Twitch Desk",
          sourceName: "Twitch Desk",
          broadcasterUserId: undefined,
          conversationId: "",
          showStream: false,
        },
        {
          enabled: false,
          platform: "kick",
          profileId: "market-bubble",
          profileName: "Market Bubble",
          sourceHandle: "marketbubble",
          sourceLabel: "Kick Desk",
          sourceName: "Kick Desk",
          broadcasterUserId: "676",
          conversationId: "",
          showStream: true,
        },
        {
          enabled: true,
          platform: "x",
          profileId: "market-bubble",
          profileName: "Market Bubble",
          sourceHandle: "MarketBubble",
          sourceLabel: "X Desk",
          sourceName: "X Desk",
          broadcasterUserId: undefined,
          conversationId: "123",
          showStream: false,
        },
      ],
    );
  });

  it("creates a new expanded profile with empty platform slots", () => {
    const profile = createEmptyProfile(3);

    assert.equal(profile.id, "profile-4");
    assert.equal(profile.name, "New Profile 4");
    assert.equal(profile.expanded, true);
    assert.deepEqual(Object.keys(profile.sources), ["twitch", "kick", "x"]);
    assert.equal(profile.sources.twitch.enabled, false);
    assert.equal(profile.sources.twitch.handle, "");
    assert.equal(profile.sources.twitch.showStream, false);
    assert.equal(profile.sources.twitch.sourceId, "");
  });

  it("keeps the saved sourceId in each platform slot so live status can map SSE events", () => {
    const [profile] = buildProfilesFromSources([
      {
        enabled: true,
        platform: "twitch",
        profileId: "marketbubble",
        profileName: "Market Bubble",
        sourceHandle: "marketbubble",
        sourceId: "twitch-marketbubble",
        sourceLabel: "Market Bubble",
        sourceName: "Market Bubble",
      },
    ]);

    assert.equal(profile.sources.twitch.sourceId, "twitch-marketbubble");
    // Saving still lets the server derive ids from the (possibly new) handle.
    const [source] = buildSourcesFromProfiles([profile]);
    assert.equal("sourceId" in source, false);
  });

  it("extracts handles from pasted profile URLs and @names", () => {
    const sources = buildSourcesFromProfiles([
      {
        id: "paste",
        name: "Paste",
        sources: {
          twitch: { enabled: true, handle: "https://www.twitch.tv/MarketBubble?ref=tw" },
          kick: { enabled: true, handle: "kick.com/marketbubble/" },
          x: { enabled: true, handle: "@MarketBubble" },
        },
      },
    ]);

    assert.deepEqual(
      sources.map((source) => [source.platform, source.sourceHandle]),
      [
        ["twitch", "MarketBubble"],
        ["kick", "marketbubble"],
        ["x", "MarketBubble"],
      ],
    );

    const [fromPostUrl] = buildSourcesFromProfiles([
      { id: "z", name: "Z", sources: { x: { enabled: true, handle: "https://x.com/Banks/status/123" } } },
    ]);
    assert.equal(fromPostUrl.sourceHandle, "Banks");

    // Non-profile URLs (e.g. a broadcast link) cannot name a handle; the row stays unsaved.
    const broadcastPaste = buildSourcesFromProfiles([
      { id: "b", name: "B", sources: { x: { enabled: true, handle: "https://x.com/i/broadcasts/1yKAPPboWlDxb" } } },
    ]);
    assert.equal(broadcastPaste.length, 0);
  });
});
