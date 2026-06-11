export const profilePlatforms = [
  { id: "twitch", label: "Twitch", handleLabel: "Twitch handle" },
  { id: "kick", label: "Kick", handleLabel: "Kick handle" },
  { id: "x", label: "X", handleLabel: "X handle" },
  { id: "room", label: "MarketBubble.com", handleLabel: "Site chat slug" },
];

export function buildProfilesFromSources(sources) {
  const profilesById = new Map();

  for (const source of Array.isArray(sources) ? sources : []) {
    const platform = String(source.platform || "").toLowerCase();
    if (!profilePlatforms.some((item) => item.id === platform)) continue;

    const profileId = normalizeProfileId(source.profileId || source.sourceHandle || source.sourceName);
    if (!profileId) continue;

    if (!profilesById.has(profileId)) {
      profilesById.set(profileId, {
        expanded: false,
        id: profileId,
        name: normalizeProfileName(source.profileName || source.sourceLabel || source.sourceName || profileId),
        sources: createEmptySourceSlots(),
      });
    }

    const profile = profilesById.get(profileId);
    if (source.profileName) profile.name = normalizeProfileName(source.profileName);
    profile.sources[platform] = {
      broadcasterUserId: platform === "kick" ? String(source.broadcasterUserId || "") : "",
      broadcastId: platform === "x" ? String(source.broadcastId || "") : "",
      conversationId: String(source.conversationId || ""),
      enabled: source.enabled !== false,
      handle: String(source.sourceHandle || ""),
      label: String(source.sourceLabel || source.sourceName || ""),
      showStream: source.showStream === true,
      sourceId: String(source.sourceId || ""),
    };
  }

  return [...profilesById.values()];
}

export function buildSourcesFromProfiles(profiles) {
  return (Array.isArray(profiles) ? profiles : []).flatMap((profile, index) => {
    const profileName = normalizeProfileName(profile.name || `Profile ${index + 1}`);
    const profileId = normalizeProfileId(profile.id || profileName || `profile-${index + 1}`);

    return profilePlatforms
      .map(({ id: platform }) => {
        const source = profile.sources?.[platform] || {};
        const sourceHandle = extractHandleInput(source.handle);
        if (!sourceHandle) return null;

        const sourceLabel = String(source.label || profileName).trim() || profileName;
        return {
          ...(platform === "kick" && source.broadcasterUserId ? {
            broadcasterUserId: String(source.broadcasterUserId).trim(),
          } : {}),
          ...(platform === "x" && source.broadcastId ? {
            broadcastId: String(source.broadcastId).trim(),
          } : {}),
          conversationId: platform === "x" ? String(source.conversationId || "").trim() : "",
          enabled: source.enabled === true,
          platform,
          profileId,
          profileName,
          showStream: source.showStream === true,
          sourceHandle,
          sourceLabel,
          sourceName: sourceLabel,
        };
      })
      .filter(Boolean);
  });
}

export function createEmptyProfile(index = 0) {
  const number = Number(index) + 1;

  return {
    expanded: true,
    id: `profile-${number}`,
    name: `New Profile ${number}`,
    sources: createEmptySourceSlots(),
  };
}

export function createEmptySourceSlots() {
  return Object.fromEntries(
    profilePlatforms.map(({ id }) => [
      id,
      {
        broadcasterUserId: "",
        broadcastId: "",
        conversationId: "",
        enabled: false,
        handle: "",
        label: "",
        showStream: false,
        sourceId: "",
      },
    ]),
  );
}

// Handle inputs accept pasted profile URLs and @names. Non-profile URL paths
// (broadcast/video links) cannot name a handle, so they collapse to empty.
const RESERVED_URL_SEGMENTS = new Set(["i", "videos", "directory", "category", "status"]);

function extractHandleInput(value) {
  let handle = String(value || "").trim();

  const withoutProtocol = handle.replace(/^https?:\/\//i, "");
  const [firstToken, ...pathSegments] = withoutProtocol.split("/").filter(Boolean);
  if (firstToken?.includes(".") && pathSegments.length > 0) {
    handle = RESERVED_URL_SEGMENTS.has(pathSegments[0].toLowerCase()) ? "" : pathSegments[0];
  }

  return handle.replace(/^@/, "").split("?")[0].trim();
}

function normalizeProfileId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeProfileName(value) {
  return String(value || "").trim();
}
