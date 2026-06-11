import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSelectedStreamSource, getStreamSelectionKey } from "../src/viewer-stream.mjs";

describe("stream selection", () => {
  const twitch = { platform: "twitch", sourceId: "twitch-xqc", sourceHandle: "xqc", sourceLabel: "Xtwin" };
  const kick = { platform: "kick", sourceId: "kick-xqc", sourceHandle: "xqc", sourceLabel: "Xbob" };

  it("selects the showStream source, falling back twitch-first", () => {
    assert.equal(getSelectedStreamSource([twitch, { ...kick, showStream: true }]).sourceId, "kick-xqc");
    assert.equal(getSelectedStreamSource([kick, twitch]).sourceId, "twitch-xqc");
  });

  it("keys the selected stream by identity, not labels", () => {
    const before = getStreamSelectionKey([{ ...twitch, showStream: true }, kick]);
    const relabeled = getStreamSelectionKey([{ ...twitch, showStream: true, sourceLabel: "Renamed" }, kick]);

    assert.notEqual(before, "");
    assert.equal(before, relabeled);
  });

  it("changes the key when the shown stream moves to another source", () => {
    const twitchShown = getStreamSelectionKey([{ ...twitch, showStream: true }, kick]);
    const kickShown = getStreamSelectionKey([twitch, { ...kick, showStream: true }]);

    assert.notEqual(twitchShown, kickShown);
  });

  it("changes the key when the selected source's handle or X conversation changes", () => {
    const before = getStreamSelectionKey([{ ...twitch, showStream: true }]);
    const rehandled = getStreamSelectionKey([{ ...twitch, showStream: true, sourceHandle: "fazebanks" }]);
    assert.notEqual(before, rehandled);

    const x = { platform: "x", sourceId: "x-banks", sourceHandle: "banks", showStream: true };
    assert.notEqual(
      getStreamSelectionKey([{ ...x, conversationId: "111" }]),
      getStreamSelectionKey([{ ...x, conversationId: "222" }]),
    );
  });

  it("returns an empty key when there are no sources", () => {
    assert.equal(getStreamSelectionKey([]), "");
  });
});
