import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createYoutubeApiClient, parseIso8601Duration } from "../src/youtube-api.mjs";

describe("youtube api client", () => {
  it("parses ISO 8601 video durations", () => {
    assert.equal(parseIso8601Duration("PT45S"), 45);
    assert.equal(parseIso8601Duration("PT1M30S"), 90);
    assert.equal(parseIso8601Duration("PT1H2M3S"), 3723);
  });

  it("reports not configured without an api key", async () => {
    const client = createYoutubeApiClient({ apiKey: "" });
    assert.equal(client.isConfigured(), false);
    assert.deepEqual(await client.getChannelVideos("channel-id"), { longform: [], shorts: [] });
  });

  it("splits uploads into longform videos and shorts", async () => {
    const client = createYoutubeApiClient({
      apiKey: "yt-key",
      fetchImpl: async (url) => {
        const href = String(url);

        if (href.includes("/channels?")) {
          return jsonResponse({
            items: [{ contentDetails: { relatedPlaylists: { uploads: "UU-uploads" } } }],
          });
        }

        if (href.includes("/playlistItems?")) {
          return jsonResponse({
            items: [
              { contentDetails: { videoId: "long-1" }, snippet: { resourceId: { videoId: "long-1" } } },
              { contentDetails: { videoId: "short-1" }, snippet: { resourceId: { videoId: "short-1" } } },
            ],
          });
        }

        if (href.includes("/videos?")) {
          return jsonResponse({
            items: [
              {
                id: "long-1",
                snippet: {
                  publishedAt: "2026-06-01T12:00:00Z",
                  title: "Long episode",
                  thumbnails: { high: { url: "https://img/long.jpg" } },
                },
                contentDetails: { duration: "PT20M10S" },
              },
              {
                id: "short-1",
                snippet: {
                  publishedAt: "2026-06-02T12:00:00Z",
                  title: "Quick clip",
                  thumbnails: { high: { url: "https://img/short.jpg" } },
                },
                contentDetails: { duration: "PT42S" },
              },
            ],
          });
        }

        throw new Error(`Unexpected URL: ${href}`);
      },
    });

    assert.deepEqual(await client.getChannelVideos("channel-id", { limitPerType: 15 }), {
      longform: [
        {
          durationSeconds: 1210,
          isShort: false,
          published: "2026-06-01",
          thumbnail: "https://img/long.jpg",
          title: "Long episode",
          url: "https://www.youtube.com/watch?v=long-1",
          videoId: "long-1",
        },
      ],
      shorts: [
        {
          durationSeconds: 42,
          isShort: true,
          published: "2026-06-02",
          thumbnail: "https://img/short.jpg",
          title: "Quick clip",
          url: "https://www.youtube.com/shorts/short-1",
          videoId: "short-1",
        },
      ],
    });
  });
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}
