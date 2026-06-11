import {
  buildProfilesFromSources,
  buildSourcesFromProfiles,
  createEmptyProfile,
  profilePlatforms,
} from "./profile-model.mjs";
import { describeSourceStatus } from "./status-model.mjs";

const LIVE_STATE_POLL_MS = 15000;
const STATUS_RENDER_DELAY_MS = 250;
const STATUS_TICK_MS = 5000;

const elements = {
  addProfileButton: document.querySelector("#addProfileButton"),
  bridgeToken: document.querySelector("#bridgeToken"),
  copyBridgeToken: document.querySelector("#copyBridgeToken"),
  editorPanel: document.querySelector("#editorPanel"),
  loginForm: document.querySelector("#loginForm"),
  loginPanel: document.querySelector("#loginPanel"),
  logoutButton: document.querySelector("#logoutButton"),
  passwordForm: document.querySelector("#passwordForm"),
  passwordPanel: document.querySelector("#passwordPanel"),
  profileCards: document.querySelector("#profileCards"),
  revealBridgeToken: document.querySelector("#revealBridgeToken"),
  saveSourcesButton: document.querySelector("#saveSourcesButton"),
  status: document.querySelector("#adminStatus"),
};

let profiles = [];
// Snapshot of the last server-confirmed slots, keyed by `${profileId}:${platform}`.
// Status lines compare live inputs against it to show "Save to connect".
let savedSlotsByKey = new Map();
const liveStatus = {
  connectorBySourceId: new Map(),
  lastChatBySourceId: new Map(),
  liveBySourceId: new Map(),
  providers: null,
};
let statusEngine = null;
let statusRenderTimer = 0;

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = new FormData(elements.loginForm).get("password");
  const response = await requestApi("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    showStatus(response.status === 401 ? "Invalid password." : await readError(response));
    return;
  }

  elements.loginForm.reset();
  await loadSources();
});

elements.addProfileButton.addEventListener("click", () => {
  profiles = collectProfilesFromDom();
  profiles.push(createEmptyProfile(profiles.length));
  renderProfiles();
});

elements.saveSourcesButton.addEventListener("click", async () => {
  profiles = collectProfilesFromDom();
  const response = await requestApi("/api/admin/sources", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sources: buildSourcesFromProfiles(profiles) }),
  });

  if (!response.ok) {
    showStatus(await readError(response));
    return;
  }

  const body = await response.json();
  adoptServerSources(body.sources);
  renderProfiles();
  showStatus("Saved.");
  refreshLiveState();
});

elements.logoutButton.addEventListener("click", async () => {
  await requestApi("/api/admin/logout", { method: "POST" });
  profiles = [];
  savedSlotsByKey = new Map();
  stopStatusEngine();
  renderProfiles();
  showLogin();
});

elements.profileCards.addEventListener("input", handleEditorInput);
elements.profileCards.addEventListener("change", scheduleStatusRender);

elements.revealBridgeToken.addEventListener("click", () => {
  const revealed = elements.bridgeToken.type === "text";
  elements.bridgeToken.type = revealed ? "password" : "text";
  elements.revealBridgeToken.textContent = revealed ? "Show" : "Hide";
});

elements.passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fields = new FormData(elements.passwordForm);
  const response = await requestApi("/api/admin/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      currentPassword: fields.get("currentPassword"),
      newPassword: fields.get("newPassword"),
    }),
  });

  if (!response.ok) {
    showStatus(await readError(response));
    return;
  }

  elements.passwordForm.reset();
  elements.passwordPanel.open = false;
  showStatus("Password updated.");
  // The X Bridge token derives from the password, so re-fetch the new one.
  loadBridgeToken();
});

elements.copyBridgeToken.addEventListener("click", async () => {
  if (!elements.bridgeToken.value) return;
  try {
    await navigator.clipboard.writeText(elements.bridgeToken.value);
    showStatus("Bridge token copied.");
  } catch {
    elements.bridgeToken.type = "text";
    elements.revealBridgeToken.textContent = "Hide";
    elements.bridgeToken.select();
    showStatus("Copy failed — select and copy manually.");
  }
});

await loadSources();

async function loadSources() {
  const response = await requestApi("/api/admin/sources");

  if (response.status === 401) {
    showLogin();
    return;
  }

  if (!response.ok) {
    showStatus(await readError(response));
    return;
  }

  const body = await response.json();
  adoptServerSources(body.sources);
  if (profiles[0]) profiles[0].expanded = true;
  renderProfiles();
  showEditor();
  loadBridgeToken();
  startStatusEngine();
}

async function loadBridgeToken() {
  try {
    const response = await requestApi("/api/admin/x-ingest-token");
    if (!response.ok) return;
    const body = await response.json();
    elements.bridgeToken.value = body.token || "";
  } catch {
    // Non-fatal: the editor still works, the token panel just stays empty.
  }
}

function adoptServerSources(sources) {
  const expandedById = new Map(profiles.map((profile) => [profile.id, profile.expanded === true]));
  profiles = buildProfilesFromSources(sources);
  for (const profile of profiles) {
    if (expandedById.get(profile.id)) profile.expanded = true;
  }

  savedSlotsByKey = new Map(
    profiles.flatMap((profile) =>
      profilePlatforms.map(({ id: platform }) => [
        `${profile.id}:${platform}`,
        { ...profile.sources[platform] },
      ]),
    ),
  );
}

function renderProfiles() {
  elements.profileCards.replaceChildren(...profiles.map(renderProfileCard));
  renderStatusLines();
}

function renderProfileCard(profile, index) {
  const card = document.createElement("article");
  card.className = "profile-editor-card";
  if (profile.expanded) card.classList.add("is-expanded");
  card.dataset.index = String(index);
  card.dataset.profileId = profile.id;

  card.append(renderProfileHeader(profile, index), renderProfileBody(profile, index));
  return card;
}

function renderProfileHeader(profile, index) {
  const button = document.createElement("button");
  button.className = "profile-editor-toggle";
  button.type = "button";
  button.setAttribute("aria-expanded", String(profile.expanded === true));
  button.setAttribute("aria-label", `${profile.expanded ? "Close" : "Open"} ${profile.name || "profile"}`);
  button.addEventListener("click", () => toggleProfile(index));

  const toggleIcon = document.createElement("span");
  toggleIcon.className = "profile-toggle-icon";
  toggleIcon.setAttribute("aria-hidden", "true");
  toggleIcon.textContent = profile.expanded ? "-" : "+";

  const title = document.createElement("span");
  title.className = "profile-editor-title";
  title.textContent = profile.name || "Unnamed Profile";

  const meta = document.createElement("span");
  meta.className = "profile-editor-meta";
  meta.textContent = summarizeProfile(profile);

  const badges = document.createElement("span");
  badges.className = "profile-platform-badges";
  badges.append(...profilePlatforms.map((platform) => renderPlatformBadge(profile, platform.id, platform.label)));

  button.append(toggleIcon, title, meta, badges);
  return button;
}

function renderProfileBody(profile, index) {
  const body = document.createElement("div");
  body.className = "profile-editor-body";
  body.hidden = profile.expanded !== true;

  body.append(
    createProfileNameField(profile.name),
    createSocialGrid(profile),
    createRemoveProfileButton(index),
  );

  return body;
}

function createProfileNameField(value) {
  const field = createField("Profile name", "profile-field profile-name-field");
  const input = document.createElement("input");
  input.name = "profileName";
  input.type = "text";
  input.value = value || "";
  field.append(input);
  return field;
}

function createSocialGrid(profile) {
  const grid = document.createElement("div");
  grid.className = "profile-social-grid";
  grid.append(...profilePlatforms.map((platform) => createSocialRow(profile.sources[platform.id], platform)));
  return grid;
}

function createSocialRow(source, platform) {
  const row = document.createElement("section");
  row.className = `profile-social-row platform-${platform.id}`;
  row.dataset.platform = platform.id;

  const heading = document.createElement("div");
  heading.className = "profile-platform";
  heading.append(createEnabledField(source?.enabled), createPlatformName(platform.label));

  const handleField = createTextField(platform.handleLabel, "handle", source?.handle);
  handleField.querySelector("input").dataset.hadValue = source?.handle ? "true" : "false";

  row.append(
    heading,
    handleField,
    createTextField("Chat label", "label", source?.label, "Shown in chat"),
    createStatusLine(),
    createStreamField(source?.showStream),
  );

  return row;
}

function createStatusLine() {
  const status = document.createElement("p");
  status.className = "source-status";

  const dot = document.createElement("em");
  dot.className = "source-status-dot";
  dot.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "source-status-text";
  text.setAttribute("role", "status");

  status.append(dot, text);
  return status;
}

function createEnabledField(checked) {
  const label = document.createElement("label");
  label.className = "profile-enabled-field";
  const input = document.createElement("input");
  input.name = "enabled";
  input.type = "checkbox";
  input.checked = checked === true;
  label.append(input);
  return label;
}

function createStreamField(checked) {
  const label = document.createElement("label");
  label.className = "profile-stream-field";
  const input = document.createElement("input");
  input.name = "showStream";
  input.type = "checkbox";
  input.checked = checked === true;
  input.addEventListener("change", enforceOneStreamSelection);
  const span = document.createElement("span");
  span.textContent = "Show stream";
  label.append(input, span);
  return label;
}

function enforceOneStreamSelection(event) {
  if (!event.target.checked) return;

  document.querySelectorAll('[name="showStream"]').forEach((input) => {
    if (input !== event.target) input.checked = false;
  });

  const row = event.target.closest(".profile-social-row");
  const enabledInput = row?.querySelector('[name="enabled"]');
  if (enabledInput) enabledInput.checked = true;
}

function createPlatformName(labelText) {
  const label = document.createElement("span");
  label.textContent = labelText;
  return label;
}

function createTextField(labelText, name, value, placeholder) {
  const field = createField(labelText, "profile-field");
  const input = document.createElement("input");
  input.name = name;
  input.type = "text";
  input.value = value || "";
  if (placeholder) input.placeholder = placeholder;
  field.append(input);
  return field;
}

function createField(labelText, className) {
  const label = document.createElement("label");
  label.className = className;
  const span = document.createElement("span");
  span.textContent = labelText;
  label.append(span);
  return label;
}

function createRemoveProfileButton(index) {
  const button = document.createElement("button");
  button.className = "profile-remove";
  button.type = "button";
  button.textContent = "Remove Profile";
  button.addEventListener("click", () => {
    profiles = collectProfilesFromDom();
    profiles.splice(index, 1);
    renderProfiles();
  });
  return button;
}

function renderPlatformBadge(profile, platform, label) {
  const badge = document.createElement("span");
  const source = profile.sources?.[platform];
  badge.className = `profile-platform-badge platform-${platform}`;
  badge.textContent = source?.handle ? label : `${label} empty`;
  badge.dataset.empty = source?.handle ? "false" : "true";
  return badge;
}

function summarizeProfile(profile) {
  const activeSources = profilePlatforms
    .map((platform) => profile.sources?.[platform.id])
    .filter((source) => source?.enabled && source?.handle);
  const configuredSources = profilePlatforms
    .map((platform) => profile.sources?.[platform.id])
    .filter((source) => source?.handle);

  return `${activeSources.length} active / ${configuredSources.length} connected`;
}

function toggleProfile(index) {
  profiles = collectProfilesFromDom();
  profiles[index].expanded = !profiles[index].expanded;
  renderProfiles();
}

function collectProfilesFromDom() {
  return Array.from(document.querySelectorAll(".profile-editor-card")).map((card, index) => ({
    expanded: card.classList.contains("is-expanded"),
    id: card.dataset.profileId || "",
    name: card.querySelector('[name="profileName"]').value,
    sources: Object.fromEntries(
      profilePlatforms.map((platform) => [
        platform.id,
        collectSocialSource(card, platform.id, index),
      ]),
    ),
  }));
}

function collectSocialSource(card, platform, index) {
  const row = card.querySelector(`[data-platform="${platform}"]`);
  // Fields without inputs (broadcast/conversation ids, resolved broadcaster
  // ids) ride along from the last loaded state so saving the simplified form
  // never wipes them.
  const slot = profiles[index]?.sources?.[platform] || {};

  return {
    broadcasterUserId: slot.broadcasterUserId || "",
    broadcastId: slot.broadcastId || "",
    conversationId: slot.conversationId || "",
    label: row.querySelector('[name="label"]').value,
    sourceId: slot.sourceId || "",
    enabled: row.querySelector('[name="enabled"]').checked,
    handle: row.querySelector('[name="handle"]').value,
    showStream: row.querySelector('[name="showStream"]').checked,
  };
}

function handleEditorInput(event) {
  const input = event.target;

  // Typing a handle into an empty row is intent to connect it, so the row
  // enables itself; one save is all that is left.
  if (input?.name === "handle") {
    const row = input.closest(".profile-social-row");
    const enabledInput = row?.querySelector('[name="enabled"]');
    if (enabledInput && !enabledInput.checked && input.value.trim() && input.dataset.hadValue !== "true") {
      enabledInput.checked = true;
    }
    input.dataset.hadValue = input.value.trim() ? "true" : "false";
  }

  scheduleStatusRender();
}

function startStatusEngine() {
  if (statusEngine || !("EventSource" in window)) return;

  const events = new EventSource("/api/chat-events");
  events.addEventListener("chat", (event) => {
    const message = parseEventData(event);
    const sourceId = String(message?.sourceId || "");
    if (!sourceId) return;

    // Use the message's own timestamp so replayed history does not read as
    // fresh activity right after the stream connects — but never trust a
    // timestamp from the future, or "Chat active" would stick forever.
    const at = Math.min(Date.parse(message.timestamp || "") || Date.now(), Date.now());
    if (at > (liveStatus.lastChatBySourceId.get(sourceId) || 0)) {
      liveStatus.lastChatBySourceId.set(sourceId, at);
    }
    scheduleStatusRender();
  });
  events.addEventListener("chat-status", (event) => {
    const status = parseEventData(event);
    if (!status?.sourceId) return;

    liveStatus.connectorBySourceId.set(String(status.sourceId), String(status.status || ""));
    scheduleStatusRender();
  });

  statusEngine = {
    events,
    pollTimer: window.setInterval(refreshLiveState, LIVE_STATE_POLL_MS),
    tickTimer: window.setInterval(renderStatusLines, STATUS_TICK_MS),
  };
  refreshLiveState();
}

function stopStatusEngine() {
  if (!statusEngine) return;

  statusEngine.events.close();
  window.clearInterval(statusEngine.pollTimer);
  window.clearInterval(statusEngine.tickTimer);
  statusEngine = null;
}

async function refreshLiveState() {
  const response = await requestApi("/api/live-state");
  if (!response.ok) return;

  try {
    const body = await response.json();
    liveStatus.providers = body.providers || {};
    liveStatus.liveBySourceId = new Map(
      (Array.isArray(body.sources) ? body.sources : []).map((source) => [String(source.sourceId), source]),
    );
    renderStatusLines();
  } catch {
    // Keep the last known live state when a poll returns malformed data.
  }
}

function scheduleStatusRender() {
  if (statusRenderTimer) return;

  statusRenderTimer = window.setTimeout(() => {
    statusRenderTimer = 0;
    renderStatusLines();
  }, STATUS_RENDER_DELAY_MS);
}

function renderStatusLines() {
  const now = Date.now();

  for (const card of document.querySelectorAll(".profile-editor-card")) {
    const profileId = card.dataset.profileId || "";

    for (const row of card.querySelectorAll(".profile-social-row")) {
      const platform = row.dataset.platform || "";
      const saved = savedSlotsByKey.get(`${profileId}:${platform}`);
      const handle = row.querySelector('[name="handle"]')?.value.trim() || "";
      const label = row.querySelector('[name="label"]')?.value.trim() || "";
      const enabled = row.querySelector('[name="enabled"]')?.checked === true;
      const showStream = row.querySelector('[name="showStream"]')?.checked === true;
      const sourceId = saved?.sourceId || "";

      const status = describeSourceStatus({
        platform,
        enabled,
        handle,
        dirty: hasUnsavedEdits({ saved, handle, enabled, showStream, label }),
        broadcastId: saved?.broadcastId || "",
        provider: liveStatus.providers?.[platform] || null,
        live: (sourceId && liveStatus.liveBySourceId.get(sourceId)) || null,
        connectorStatus: (sourceId && liveStatus.connectorBySourceId.get(sourceId)) || "",
        lastChatAt: (sourceId && liveStatus.lastChatBySourceId.get(sourceId)) || 0,
        now,
      });

      const dot = row.querySelector(".source-status-dot");
      const text = row.querySelector(".source-status-text");
      if (dot) dot.dataset.tone = status.tone;
      if (text && text.textContent !== status.text) text.textContent = status.text;
    }
  }
}

function hasUnsavedEdits({ saved, handle, enabled, showStream, label }) {
  if (!saved) return handle !== "";

  return handle !== String(saved.handle || "")
    || label !== String(saved.label || "").trim()
    || enabled !== (saved.enabled === true)
    || showStream !== (saved.showStream === true);
}

function parseEventData(event) {
  try {
    return JSON.parse(event.data);
  } catch {
    return null;
  }
}

function showLogin() {
  elements.loginPanel.hidden = false;
  elements.editorPanel.hidden = true;
  elements.passwordForm.reset();
  elements.passwordPanel.open = false;
  elements.bridgeToken.value = "";
  elements.bridgeToken.type = "password";
  elements.revealBridgeToken.textContent = "Show";
  showStatus("");
}

function showEditor() {
  elements.loginPanel.hidden = true;
  elements.editorPanel.hidden = false;
  showStatus("");
}

function showStatus(message) {
  elements.status.textContent = message;
}

async function readError(response) {
  if (response.unavailable || response.status === 404 || response.status === 405) {
    return "Admin API unavailable. Run the Node server, not the static Python server.";
  }

  try {
    const body = await response.json();
    return body.error || "Request failed.";
  } catch {
    return "Request failed.";
  }
}

async function requestApi(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    return { ok: false, unavailable: true };
  }
}
