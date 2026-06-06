import { mergeMessages } from "./chat-model.mjs";

const scriptedMessages = [
  ["twitch-marketbubble", "TapeReader", "tape-reader", "Twitch chat finally in one place would be insane", -118],
  ["kick-marketbubble", "RiskOnRiley", "riskon", "Kick chat moving faster than the candles", -109],
  ["x-banks", "MacroMax", "macromax", "Banks X stream should sit beside chat imo", -101],
  ["x-z", "VolatilitySmile", "volsmile", "Z stream replies are pulling in too", -92],
  ["twitch-marketbubble", "ChartLad", "chartlad", "Banks is cooking with this challenge", -82],
  ["kick-marketbubble", "EVHunter", "evhunter", "source labels are the whole point", -74],
  ["room-marketbubble", "DeskSeat", "deskseat", "native marketbubble.com chat is clean", -66],
  ["x-banks", "Quoter", "quoteflow", "X comments need their own source label", -54],
  ["x-z", "ZedFlow", "zedflow", "Z side is live in the same room", -43],
  ["twitch-marketbubble", "OrderbookOli", "oli", "just stream plus combined chat", -37],
  ["kick-marketbubble", "GreenCandle", "greencandle", "simple is better here", -29],
  ["room-marketbubble", "Nikita", "nikita", "okay this makes way more sense now", -16],
];

const livePool = [
  ["x-banks", "CryptoJack", "cryptojack", "Banks X comment showing beside stream chat"],
  ["x-z", "ZedFlow", "zedflow", "Z X stream reply just hit"],
  ["room-marketbubble", "DeskSeat", "deskseat", "native chat feels better here"],
  ["x-banks", "PMFSeeker", "pmfseeker", "ship the simple demo link"],
];

export function seedDemoMessages({ hasSource, buildSourceMessage, now = Date.now() }) {
  return mergeMessages(
    scriptedMessages
      .filter(([sourceId]) => hasSource(sourceId))
      .map(([sourceId, author, handle, body, secondsAgo]) =>
        buildSourceMessage(sourceId, author, handle, body, new Date(now + secondsAgo * 1000).toISOString()),
      ),
  );
}

export function startDemoChat({
  window,
  hasSource,
  buildConfiguredMessage,
  addMessage,
  queueRender,
  isInspectingProfile,
}) {
  return window.setInterval(() => {
    if (isInspectingProfile()) {
      return;
    }

    const availableMessages = livePool.filter(([sourceId]) => hasSource(sourceId));
    if (availableMessages.length === 0) {
      return;
    }

    const [sourceId, author, handle, body] = availableMessages[Math.floor(Math.random() * availableMessages.length)];
    addMessage(buildConfiguredMessage(sourceId, author, handle, body, new Date().toISOString()));
    queueRender();
  }, 2800);
}
