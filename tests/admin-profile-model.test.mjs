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
      },
      {
        enabled: true,
        platform: "kick",
        profileId: "xqc",
        profileName: "xQc",
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
    assert.equal(profiles[0].sources.kick.handle, "xqc");
    assert.equal(profiles[0].sources.kick.label, "Xbob");
    assert.equal(profiles[1].id, "banks");
    assert.equal(profiles[1].sources.x.conversationId, "2062574325970973093");
  });

  it("collects expanded profile data back into source rows without blank socials", () => {
    const sources = buildSourcesFromProfiles([
      {
        id: "market-bubble",
        name: "Market Bubble",
        sources: {
          twitch: { enabled: true, handle: "marketbubble", label: "Twitch Desk" },
          kick: { enabled: false, handle: "marketbubble", label: "Kick Desk" },
          x: { enabled: true, handle: "MarketBubble", label: "X Desk", conversationId: "123" },
          room: { enabled: true, handle: "", label: "Site Chat" },
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
        conversationId: source.conversationId,
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
          conversationId: "",
        },
        {
          enabled: false,
          platform: "kick",
          profileId: "market-bubble",
          profileName: "Market Bubble",
          sourceHandle: "marketbubble",
          sourceLabel: "Kick Desk",
          sourceName: "Kick Desk",
          conversationId: "",
        },
        {
          enabled: true,
          platform: "x",
          profileId: "market-bubble",
          profileName: "Market Bubble",
          sourceHandle: "MarketBubble",
          sourceLabel: "X Desk",
          sourceName: "X Desk",
          conversationId: "123",
        },
      ],
    );
  });

  it("creates a new expanded profile with empty platform slots", () => {
    const profile = createEmptyProfile(3);

    assert.equal(profile.id, "profile-4");
    assert.equal(profile.name, "New Profile 4");
    assert.equal(profile.expanded, true);
    assert.deepEqual(Object.keys(profile.sources), ["twitch", "kick", "x", "room"]);
    assert.equal(profile.sources.twitch.enabled, false);
    assert.equal(profile.sources.twitch.handle, "");
  });
});
