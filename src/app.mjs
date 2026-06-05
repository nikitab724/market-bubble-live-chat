import {
  buildAuthorProfile,
  buildViewerSummary,
  mergeMessages,
  normalizeMessage,
} from "./chat-model.mjs";
import { connectTwitchChat } from "./twitch-connector.mjs";

const platformMeta = {
  twitch: {
    label: "Twitch",
    source: "https://twitch.tv/marketbubble",
  },
  kick: {
    label: "Kick",
    source: "https://kick.com/marketbubble",
  },
  x: {
    label: "X",
    source: "https://x.com/MarketBubble",
  },
  room: {
    label: "MB.com",
    source: "https://marketbubble.com",
  },
};

const connectedSources = [
  {
    sourceId: "twitch-marketbubble",
    platform: "twitch",
    sourceName: "Market Bubble",
    sourceHandle: "marketbubble",
    sourceUrl: "https://twitch.tv/marketbubble",
    viewerCount: 3184,
  },
  {
    sourceId: "kick-marketbubble",
    platform: "kick",
    sourceName: "Market Bubble",
    sourceHandle: "marketbubble",
    sourceUrl: "https://kick.com/marketbubble",
    viewerCount: 1260,
  },
  {
    sourceId: "x-banks",
    platform: "x",
    sourceName: "Banks",
    sourceHandle: "Banks",
    sourceUrl: "https://x.com/Banks",
    viewerCount: 8062,
  },
  {
    sourceId: "x-z",
    platform: "x",
    sourceName: "Z",
    sourceHandle: "z",
    sourceUrl: "https://x.com/z",
    viewerCount: 4720,
  },
  {
    sourceId: "room-marketbubble",
    platform: "room",
    sourceName: "MarketBubble.com",
    sourceHandle: "marketbubble",
    sourceUrl: "https://marketbubble.com",
    viewerCount: 518,
  },
];

const sourceById = new Map(connectedSources.map((source) => [source.sourceId, source]));

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

// Twitch entries removed — real messages come from the live connector now.
const livePool = [
  ["kick-marketbubble", "LongOnly", "longonly", "Kick is live in the same feed"],
  ["x-banks", "CryptoJack", "cryptojack", "Banks X comment showing beside stream chat"],
  ["x-z", "ZedFlow", "zedflow", "Z X stream reply just hit"],
  ["room-marketbubble", "DeskSeat", "deskseat", "native chat feels better here"],
  ["kick-marketbubble", "LiquidationLarry", "larry", "this is all it needed to be"],
  ["x-banks", "PMFSeeker", "pmfseeker", "ship the simple demo link"],
];

const state = {
  inspectingProfile: false,
  sources: connectedSources.map((source) => ({ ...source })),
  messages: seedMessages(),
  twitchStatus: "connecting",
};

const elements = {
  chatFeed: document.querySelector("#chatFeed"),
  sourceBreakdown: document.querySelector("#sourceBreakdown"),
  viewerCount: document.querySelector("#viewerCount"),
};

bindEvents();
render();
initTwitchPlayer();
startTwitchConnector();

window.setInterval(() => {
  if (state.inspectingProfile) {
    return;
  }

  pushLiveMessage();
  nudgeViewerCounts();
  render();
}, 2800);

function initTwitchPlayer() {
  const playerEl = document.querySelector("#twitchPlayer");
  if (!playerEl) return;

  const twitchSource = connectedSources.find((s) => s.platform === "twitch");
  if (!twitchSource) return;

  const parent = window.location.hostname || "localhost";
  const iframe = document.createElement("iframe");
  iframe.src = `https://player.twitch.tv/?channel=${encodeURIComponent(twitchSource.sourceHandle)}&parent=${encodeURIComponent(parent)}&autoplay=true`;
  iframe.allowFullscreen = true;
  iframe.allow = "autoplay; fullscreen";
  iframe.title = `${twitchSource.sourceName} on Twitch`;

  playerEl.appendChild(iframe);
}

function startTwitchConnector() {
  const twitchSource = connectedSources.find((s) => s.platform === "twitch");
  if (!twitchSource) return;

  connectTwitchChat(twitchSource.sourceHandle, {
    onMessage(rawMessage) {
      state.messages = mergeMessages([
        normalizeMessage(rawMessage),
        ...state.messages,
      ]).slice(0, 60);
      render();
    },
    onStatus(status) {
      state.twitchStatus = status;
      render();
    },
  });
}

function bindEvents() {
  elements.chatFeed.addEventListener("pointerover", (event) => {
    if (event.target.closest(".chat-message")) {
      state.inspectingProfile = true;
    }
  });

  elements.chatFeed.addEventListener("pointerout", () => {
    window.setTimeout(updateInspectingState, 0);
  });
}

function seedMessages() {
  const now = Date.now();

  return mergeMessages(
    scriptedMessages.map(([sourceId, author, handle, body, secondsAgo]) =>
      buildSourceMessage(sourceId, author, handle, body, new Date(now + secondsAgo * 1000).toISOString()),
    ),
  );
}

function pushLiveMessage() {
  const [sourceId, author, handle, body] = livePool[Math.floor(Math.random() * livePool.length)];

  state.messages = mergeMessages([
    normalizeMessage(buildSourceMessage(sourceId, author, handle, body, new Date().toISOString())),
    ...state.messages,
  ]).slice(0, 60);
}

function buildSourceMessage(sourceId, author, handle, body, timestamp) {
  const source = sourceById.get(sourceId);

  if (!source) {
    throw new Error(`Unknown source: ${sourceId}`);
  }

  return {
    platform: source.platform,
    author,
    handle,
    body,
    timestamp,
    sourceUrl: getProfileUrl(source.platform, handle),
    sourceId: source.sourceId,
    sourceName: source.sourceName,
    sourceHandle: source.sourceHandle,
    sourceLabel: source.sourceName,
  };
}

function nudgeViewerCounts() {
  state.sources = state.sources.map((source) => {
    const delta = Math.floor(Math.random() * 13) - 4;

    return {
      ...source,
      viewerCount: Math.max(0, source.viewerCount + delta),
    };
  });
}

function render() {
  const viewerSummary = buildViewerSummary(state.sources);

  elements.viewerCount.textContent = formatNumber(viewerSummary.total);
  elements.sourceBreakdown.innerHTML = viewerSummary.sources.map(renderSource).join("");
  elements.chatFeed.innerHTML = state.messages.map(renderMessage).join("");
}

function renderSource(source) {
  const meta = platformMeta[source.platform];
  const statusDot = source.platform === "twitch" ? renderStatusDot(state.twitchStatus) : "";

  return `
    <div class="source-chip ${source.platform}" title="${escapeHtml(meta.label)} / ${escapeHtml(source.sourceLabel)}">
      <span>${escapeHtml(meta.label)}</span>
      <strong>${escapeHtml(source.sourceLabel)}</strong>
      ${statusDot}
      <b>${formatNumber(source.viewerCount)}</b>
    </div>
  `;
}

function renderStatusDot(status) {
  const labels = { connected: "Live", connecting: "Connecting…", disconnected: "Disconnected" };
  return `<em class="live-dot ${status}" title="${labels[status] ?? status}"></em>`;
}

function renderMessage(message) {
  const meta = platformMeta[message.platform];
  const profile = buildAuthorProfile(state.messages, message);

  return `
    <article class="chat-message ${message.platform}">
      <div class="avatar ${message.platform}">${message.avatar}</div>
      <div class="message-body">
        <div class="message-meta">
          <strong title="${escapeHtml(message.author)}">${escapeHtml(message.author)}</strong>
          <span class="platform-badge ${message.platform}">${meta.label}</span>
          <span class="source-label ${message.platform}" title="${escapeHtml(meta.label)} / ${escapeHtml(message.sourceLabel)}">${escapeHtml(message.sourceLabel)}</span>
          <time>${formatTime(message.timestamp)}</time>
        </div>
        <p>${escapeHtml(message.body)}</p>
      </div>
      <div class="profile-card" role="tooltip">
        <div class="profile-card-header">
          <div class="avatar ${message.platform}">${message.avatar}</div>
          <div>
            <strong>${escapeHtml(profile.author)}</strong>
            <span>${escapeHtml(profile.displayHandle)}</span>
          </div>
        </div>
        <dl>
          <div>
            <dt>Platform</dt>
            <dd>${meta.label}</dd>
          </div>
          <div>
            <dt>Stream</dt>
            <dd>${escapeHtml(profile.sourceLabel)}</dd>
          </div>
          <div>
            <dt>Messages</dt>
            <dd>${profile.messageCount}</dd>
          </div>
          <div>
            <dt>Last seen</dt>
            <dd>${formatTime(profile.lastSeen)}</dd>
          </div>
          <div>
            <dt>Profile</dt>
            <dd><a href="${escapeHtml(profile.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(profile.sourceUrl)}</a></dd>
          </div>
        </dl>
      </div>
    </article>
  `;
}

function updateInspectingState() {
  state.inspectingProfile = elements.chatFeed.matches(":hover");
}

function getProfileUrl(platform, handle) {
  const cleanHandle = String(handle).replace(/^@/, "");

  if (platform === "twitch") {
    return `https://twitch.tv/${cleanHandle}`;
  }

  if (platform === "kick") {
    return `https://kick.com/${cleanHandle}`;
  }

  if (platform === "room") {
    return `https://marketbubble.com/u/${cleanHandle}`;
  }

  return `https://x.com/${cleanHandle}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
