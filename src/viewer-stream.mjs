import { getCountdownParts, getNextBroadcastTime } from "./broadcast-schedule.mjs";
import { escapeHtml, platformMeta } from "./platforms.mjs";

let offlineCountdownTimer = 0;

export function initStreamPlayer({ document, window, sources }) {
  const playerEl = document.querySelector("#streamPlayer");
  if (!playerEl) return;

  renderStreamEmbed(playerEl, { document, window, sources });
}

// Live-state refreshes call this. The player only re-renders when the
// selected source flips between a playable embed and the offline countdown,
// so polling never reloads a healthy iframe.
export function updateStreamPresence({ document, window, sources }) {
  const playerEl = document.querySelector("#streamPlayer");
  if (!playerEl) return;

  const streamSource = getSelectedStreamSource(sources);
  // Only a definitive provider answer (twitch/kick live-state) counts as
  // offline; X and room sources have no liveness feed and keep the embed.
  const offline = Boolean(
    streamSource
    && ["twitch", "kick"].includes(streamSource.platform)
    && streamSource.isLive === false,
  );
  const mode = offline ? "offline" : "embed";
  if (playerEl.dataset.streamMode === mode) return;

  if (mode === "offline") {
    renderStreamOffline(playerEl, { window });
    return;
  }

  renderStreamEmbed(playerEl, { document, window, sources });
}

function renderStreamEmbed(playerEl, { document, window, sources }) {
  stopOfflineCountdown(window);
  playerEl.dataset.streamMode = "embed";

  const streamSource = getSelectedStreamSource(sources);
  playerEl.replaceChildren();
  if (!streamSource) {
    renderStreamPlaceholder(playerEl);
    return;
  }

  if (streamSource.platform === "twitch") {
    playerEl.append(createTwitchStreamFrame({ source: streamSource, window }));
    return;
  }

  if (streamSource.platform === "kick") {
    playerEl.append(createKickStreamFrame({ source: streamSource, document }));
    return;
  }

  if (streamSource.platform === "x" && streamSource.conversationId) {
    renderXStreamEmbed({ playerEl, source: streamSource, document, window });
    return;
  }

  renderStreamPlaceholder(playerEl, streamSource);
}

export function getSelectedStreamSource(sources) {
  return sources.find((source) => source.showStream === true)
    || sources.find((source) => source.platform === "twitch")
    || sources.find((source) => source.platform === "kick")
    || sources[0];
}

function createTwitchStreamFrame({ source, window }) {
  const parent = window.location.hostname || "localhost";
  const iframe = window.document.createElement("iframe");
  iframe.src = `https://player.twitch.tv/?channel=${encodeURIComponent(source.sourceHandle)}&parent=${encodeURIComponent(parent)}&autoplay=true`;
  iframe.allowFullscreen = true;
  iframe.allow = "autoplay; fullscreen; picture-in-picture";
  iframe.title = `${source.sourceName} on Twitch`;
  return iframe;
}

function createKickStreamFrame({ source, document }) {
  const iframe = document.createElement("iframe");
  iframe.src = `https://player.kick.com/${encodeURIComponent(source.sourceHandle)}?autoplay=true`;
  iframe.allowFullscreen = true;
  iframe.allow = "autoplay; fullscreen; picture-in-picture";
  iframe.title = `${source.sourceName} on Kick`;
  return iframe;
}

function renderXStreamEmbed({ playerEl, source, document, window }) {
  const post = document.createElement("blockquote");
  post.className = "twitter-tweet";
  post.dataset.theme = "dark";

  const link = document.createElement("a");
  link.href = `https://x.com/${encodeURIComponent(source.sourceHandle)}/status/${encodeURIComponent(source.conversationId)}`;
  link.textContent = `${source.sourceName} on X`;
  post.append(link);
  playerEl.append(post);
  loadXWidgets({ container: playerEl, document, window });
}

function loadXWidgets({ container, document, window }) {
  if (window.twttr?.widgets?.load) {
    window.twttr.widgets.load(container);
    return;
  }

  const existingScript = document.querySelector("[data-x-widgets]");
  if (existingScript) return;

  const script = document.createElement("script");
  script.async = true;
  script.charset = "utf-8";
  script.dataset.xWidgets = "true";
  script.src = "https://platform.x.com/widgets.js";
  script.addEventListener("load", () => window.twttr?.widgets?.load(container));
  document.head.append(script);
}

const COUNTDOWN_UNITS = ["days", "hours", "minutes", "seconds"];

function renderStreamOffline(playerEl, { window }) {
  stopOfflineCountdown(window);
  playerEl.dataset.streamMode = "offline";
  playerEl.innerHTML = `
    <div class="stream-offline">
      <p class="stream-offline-eyebrow"><em class="stream-offline-dot"></em>Offline</p>
      <p class="stream-offline-title">Back Thursday <span class="stream-offline-title-dot">·</span> 1PM PST</p>
      <div class="stream-offline-count" role="timer" aria-hidden="true">
        ${COUNTDOWN_UNITS.map((unit, index) => `
          ${index === 0 ? "" : '<span class="stream-offline-sep">:</span>'}
          <span class="stream-offline-unit" data-unit="${unit}">
            <strong>0</strong>
            <span>${unit}</span>
          </span>
        `).join("")}
      </div>
      <p class="stream-offline-srtext">The stream is offline. Back Thursday at 1PM Pacific.</p>
    </div>
  `;

  let target = getNextBroadcastTime();
  const numberEls = Object.fromEntries(
    COUNTDOWN_UNITS.map((unit) => [unit, playerEl.querySelector(`[data-unit="${unit}"] strong`)]),
  );

  function tick() {
    const now = new Date();
    if (target.getTime() <= now.getTime()) {
      target = getNextBroadcastTime(now);
    }

    const parts = getCountdownParts(target, now);
    playerEl.querySelector(".stream-offline-count")?.setAttribute("data-days-hidden", String(parts.days === 0));
    for (const unit of COUNTDOWN_UNITS) {
      const value = unit === "days" ? String(parts[unit]) : String(parts[unit]).padStart(2, "0");
      if (numberEls[unit] && numberEls[unit].textContent !== value) {
        numberEls[unit].textContent = value;
      }
    }
  }

  tick();
  offlineCountdownTimer = window.setInterval(tick, 1000);
}

function stopOfflineCountdown(window) {
  if (offlineCountdownTimer) {
    window.clearInterval(offlineCountdownTimer);
    offlineCountdownTimer = 0;
  }
}

function renderStreamPlaceholder(playerEl, source = null) {
  const platform = source?.platform || "room";
  const meta = platformMeta[platform] || platformMeta.room;
  playerEl.innerHTML = `
    <div class="stream-placeholder ${escapeHtml(platform)}">
      <span>${escapeHtml(meta.label)} stream selected</span>
      <strong>${escapeHtml(source?.sourceLabel || source?.sourceName || "No stream selected")}</strong>
      <p>${source ? "Open the selected livestream source in a new tab." : "Choose a livestream source in the admin panel."}</p>
      ${source?.sourceUrl ? `<a href="${escapeHtml(source.sourceUrl)}" target="_blank" rel="noreferrer">Open Stream</a>` : ""}
    </div>
  `;
}
