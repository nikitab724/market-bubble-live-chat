const grid = document.getElementById("videoGrid");

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

function renderVideos(videos) {
  if (!videos.length) {
    grid.innerHTML = `<p class="v2-content-status">No videos found.</p>`;
    return;
  }

  grid.innerHTML = videos
    .map(
      (video) => `
        <a class="v2-video-card" href="${escapeHtml(video.url)}" target="_blank" rel="noopener">
          <div class="v2-video-thumb">
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

async function loadVideos() {
  try {
    const res = await fetch("/api/youtube-videos");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderVideos(data.videos ?? []);
  } catch {
    grid.innerHTML = `<p class="v2-content-status">Could not load videos. Try again later.</p>`;
  }
}

loadVideos();
