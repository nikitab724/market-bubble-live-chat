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
      conversationId: String(source.conversationId || ""),
      enabled: source.enabled !== false,
      handle: String(source.sourceHandle || ""),
      label: String(source.sourceLabel || source.sourceName || ""),
      showStream: source.showStream === true,
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
        const sourceHandle = String(source.handle || "").replace(/^@/, "").trim();
        if (!sourceHandle) return null;

        const sourceLabel = String(source.label || profileName).trim() || profileName;
        return {
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
        conversationId: "",
        enabled: false,
        handle: "",
        label: "",
        showStream: false,
      },
    ]),
  );
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
