import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { parseTwitchEmoteTag } from "../src/twitch-connector.mjs";

describe("twitch connector", () => {
  it("parses native Twitch IRC emote ranges into renderable emotes", () => {
    assert.deepEqual(
      parseTwitchEmoteTag("Kappa hello PogChamp", "25:0-4/88:12-19"),
      [
        {
          end: 4,
          id: "25",
          name: "Kappa",
          provider: "twitch",
          start: 0,
          url: "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0",
        },
        {
          end: 19,
          id: "88",
          name: "PogChamp",
          provider: "twitch",
          start: 12,
          url: "https://static-cdn.jtvnw.net/emoticons/v2/88/default/dark/2.0",
        },
      ],
    );
  });

  it("preserves Twitch IRC message ids so repeated chat lines do not collapse", () => {
    const connector = readFileSync(new URL("../src/twitch-connector.mjs", import.meta.url), "utf8");

    assert.equal(connector.includes("tags.id ? `twitch-${tags.id}` : undefined"), true);
  });
});
