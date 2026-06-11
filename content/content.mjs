const twitchGrid = document.getElementById("twitchGrid");
const longformGrid = document.getElementById("longformGrid");
const shortsGrid = document.getElementById("shortsGrid");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(isoDate) {
  if (!isoDate) return "";
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function renderVideoCards(grid, videos, emptyMessage, { vertical = false } = {}) {
  if (!videos.length) {
    grid.innerHTML = `<p class="v2-content-status">${escapeHtml(emptyMessage)}</p>`;
    return;
  }

  grid.innerHTML = videos
    .map(
      (video) => `
        <a class="v2-video-card${vertical ? " v2-video-card--vertical" : ""}" href="${escapeHtml(video.url)}" target="_blank" rel="noopener">
          <div class="v2-video-thumb${vertical ? " v2-video-thumb--vertical" : ""}">
            <img src="${escapeHtml(video.thumbnail)}" alt="" loading="lazy" decoding="async" />
          </div>
          <div class="v2-video-meta">
            <h2 class="v2-video-title">${escapeHtml(video.title)}</h2>
            ${video.published ? `<time class="v2-video-date" datetime="${escapeHtml(video.published)}">${escapeHtml(formatDate(video.published))}</time>` : ""}
          </div>
        </a>
      `,
    )
    .join("");
}

async function loadTwitchVods() {
  try {
    const res = await fetch("/api/twitch-vods");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderVideoCards(twitchGrid, data.vods ?? [], "No VODs found.");
  } catch {
    twitchGrid.innerHTML = `<p class="v2-content-status">Could not load VODs. Try again later.</p>`;
  }
}

async function loadYoutubeVideos() {
  try {
    const res = await fetch("/api/youtube-videos");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderVideoCards(longformGrid, data.longform ?? [], "No longform videos found.");
    renderVideoCards(shortsGrid, data.shorts ?? [], "No shorts found.", { vertical: true });
  } catch {
    longformGrid.innerHTML = `<p class="v2-content-status">Could not load videos. Try again later.</p>`;
    shortsGrid.innerHTML = `<p class="v2-content-status">Could not load shorts. Try again later.</p>`;
  }
}

loadTwitchVods();
loadYoutubeVideos();
