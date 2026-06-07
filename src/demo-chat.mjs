import { mergeMessages } from "./chat-model.mjs";

const scriptedMessages = [
  ["twitch", "twitch-marketbubble", "TapeReader", "tape-reader", "Twitch chat finally in one place would be insane", -118],
  ["kick", "kick-marketbubble", "RiskOnRiley", "riskon", "Kick chat moving faster than the candles", -109],
  ["x", "x-banks", "MacroMax", "macromax", "Banks X stream should sit beside chat imo", -101],
  ["x", "x-z", "VolatilitySmile", "volsmile", "Z stream replies are pulling in too", -92],
  ["twitch", "twitch-marketbubble", "ChartLad", "chartlad", "Banks is cooking with this challenge", -82],
  ["kick", "kick-marketbubble", "EVHunter", "evhunter", "source labels are the whole point", -74],
  ["room", "room-marketbubble", "DeskSeat", "deskseat", "native chat is clean", -66],
  ["x", "x-banks", "Quoter", "quoteflow", "X comments need their own source label", -54],
  ["x", "x-z", "ZedFlow", "zedflow", "Z side is live in the same room", -43],
  ["twitch", "twitch-marketbubble", "OrderbookOli", "oli", "just stream plus combined chat", -37],
  ["kick", "kick-marketbubble", "GreenCandle", "greencandle", "simple is better here", -29],
  ["room", "room-marketbubble", "Nikita", "nikita", "okay this makes way more sense now", -16],
];

const livePool = [
  ["x", "x-banks", "CryptoJack", "cryptojack", "Banks X comment showing beside stream chat"],
  ["x", "x-z", "ZedFlow", "zedflow", "Z X stream reply just hit"],
  ["room", "room-marketbubble", "DeskSeat", "deskseat", "native chat feels better here"],
  ["kick", "kick-marketbubble", "GreenCandle", "greencandle", "Kick logo row just hit"],
];

export function seedDemoMessages({ sources, buildSourceMessage, now = Date.now() }) {
  return mergeMessages(
    scriptedMessages
      .map(([platform, preferredSourceId, author, handle, body, secondsAgo]) => [
        resolveDemoSourceId(sources, platform, preferredSourceId),
        author,
        handle,
        body,
        secondsAgo,
      ])
      .filter(([sourceId]) => sourceId)
      .map(([sourceId, author, handle, body, secondsAgo]) =>
        buildSourceMessage(sourceId, author, handle, body, new Date(now + secondsAgo * 1000).toISOString()),
      ),
  );
}

export function startDemoChat({
  window,
  sources,
  buildConfiguredMessage,
  addMessage,
  queueRender,
  isInspectingProfile,
}) {
  return window.setInterval(() => {
    if (isInspectingProfile()) {
      return;
    }

    const availableMessages = livePool
      .map(([platform, preferredSourceId, author, handle, body]) => [
        resolveDemoSourceId(sources, platform, preferredSourceId),
        author,
        handle,
        body,
      ])
      .filter(([sourceId]) => sourceId);
    if (availableMessages.length === 0) {
      return;
    }

    const [sourceId, author, handle, body] = availableMessages[Math.floor(Math.random() * availableMessages.length)];
    addMessage(buildConfiguredMessage(sourceId, author, handle, body, new Date().toISOString()));
    queueRender();
  }, 2800);
}

function resolveDemoSourceId(sources, platform, preferredSourceId) {
  return sources.find((source) => source.sourceId === preferredSourceId)?.sourceId
    || sources.find((source) => source.platform === platform)?.sourceId
    || "";
}
