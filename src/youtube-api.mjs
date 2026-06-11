const DEFAULT_API_BASE = "https://www.googleapis.com/youtube/v3";
const SHORT_MAX_SECONDS = 60;

export function createYoutubeApiClient(options = {}) {
  const apiKey = options.apiKey ?? process.env.YOUTUBE_API_KEY ?? "";
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const apiBase = options.apiBase || DEFAULT_API_BASE;

  return {
    isConfigured() {
      return Boolean(apiKey);
    },

    async getChannelVideos(channelId, options = {}) {
      const limitPerType = clamp(Number(options.limitPerType) || 15, 1, 50);
      const maxScan = clamp(Number(options.maxScan) || 200, limitPerType, 500);

      if (!apiKey) {
        return { longform: [], shorts: [] };
      }

      const uploadsPlaylistId = await getUploadsPlaylistId(channelId);
      if (!uploadsPlaylistId) {
        return { longform: [], shorts: [] };
      }

      const longform = [];
      const shorts = [];
      let pageToken = "";
      let scanned = 0;

      while (longform.length < limitPerType || shorts.length < limitPerType) {
        const page = await listPlaylistItems(uploadsPlaylistId, pageToken);
        if (!page.items.length) break;

        const details = await getVideoDetails(page.items.map((item) => item.videoId));
        for (const video of details) {
          if (video.isShort) {
            if (shorts.length < limitPerType) shorts.push(video);
          } else if (longform.length < limitPerType) {
            longform.push(video);
          }
        }

        scanned += page.items.length;
        if (longform.length >= limitPerType && shorts.length >= limitPerType) break;
        if (!page.nextPageToken || scanned >= maxScan) break;
        pageToken = page.nextPageToken;
      }

      return { longform, shorts };
    },
  };

  async function getUploadsPlaylistId(channelId) {
    const payload = await youtubeGet("channels", {
      part: "contentDetails",
      id: channelId,
    });
    return payload.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || "";
  }

  async function listPlaylistItems(playlistId, pageToken = "") {
    const payload = await youtubeGet("playlistItems", {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: "50",
      ...(pageToken ? { pageToken } : {}),
    });

    const items = (payload.items || [])
      .map((item) => {
        const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || "";
        return videoId ? { videoId } : null;
      })
      .filter(Boolean);

    return { items, nextPageToken: payload.nextPageToken || "" };
  }

  async function getVideoDetails(videoIds) {
    if (!videoIds.length) return [];

    const payload = await youtubeGet("videos", {
      part: "snippet,contentDetails",
      id: videoIds.join(","),
    });

    return (payload.items || []).map(normalizeVideo).filter(Boolean);
  }

  async function youtubeGet(resource, params) {
    const url = new URL(`${apiBase}/${resource}`);
    url.searchParams.set("key", apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`YouTube API ${resource} failed with ${response.status}`);
    }

    return response.json();
  }
}

function normalizeVideo(video) {
  const videoId = String(video?.id || "").trim();
  if (!videoId) return null;

  const snippet = video.snippet || {};
  const durationSeconds = parseIso8601Duration(video.contentDetails?.duration);
  const isShort = durationSeconds > 0 && durationSeconds <= SHORT_MAX_SECONDS;
  const publishedAt = String(snippet.publishedAt || "");
  const thumbnails = snippet.thumbnails || {};

  return {
    durationSeconds,
    isShort,
    published: publishedAt ? publishedAt.slice(0, 10) : "",
    thumbnail: pickThumbnail(thumbnails, videoId),
    title: snippet.title || "",
    url: isShort
      ? `https://www.youtube.com/shorts/${videoId}`
      : `https://www.youtube.com/watch?v=${videoId}`,
    videoId,
  };
}

function pickThumbnail(thumbnails, videoId) {
  return (
    thumbnails.maxres?.url
    || thumbnails.standard?.url
    || thumbnails.high?.url
    || thumbnails.medium?.url
    || thumbnails.default?.url
    || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "")
  );
}

export function parseIso8601Duration(value) {
  const match = String(value || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
