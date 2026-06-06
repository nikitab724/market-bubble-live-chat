import {
  buildProfilesFromSources,
  buildSourcesFromProfiles,
  createEmptyProfile,
  profilePlatforms,
} from "./profile-model.mjs";

const elements = {
  addProfileButton: document.querySelector("#addProfileButton"),
  editorPanel: document.querySelector("#editorPanel"),
  loginForm: document.querySelector("#loginForm"),
  loginPanel: document.querySelector("#loginPanel"),
  logoutButton: document.querySelector("#logoutButton"),
  profileCards: document.querySelector("#profileCards"),
  saveSourcesButton: document.querySelector("#saveSourcesButton"),
  status: document.querySelector("#adminStatus"),
};

let profiles = [];

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
  profiles = buildProfilesFromSources(body.sources);
  renderProfiles();
  showStatus("Saved.");
});

elements.logoutButton.addEventListener("click", async () => {
  await requestApi("/api/admin/logout", { method: "POST" });
  profiles = [];
  renderProfiles();
  showLogin();
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
  profiles = buildProfilesFromSources(body.sources);
  if (profiles[0]) profiles[0].expanded = true;
  renderProfiles();
  showEditor();
}

function renderProfiles() {
  elements.profileCards.replaceChildren(...profiles.map(renderProfileCard));
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
  button.addEventListener("click", () => toggleProfile(index));

  const title = document.createElement("span");
  title.className = "profile-editor-title";
  title.textContent = profile.name || "Unnamed Profile";

  const meta = document.createElement("span");
  meta.className = "profile-editor-meta";
  meta.textContent = summarizeProfile(profile);

  const badges = document.createElement("span");
  badges.className = "profile-platform-badges";
  badges.append(...profilePlatforms.map((platform) => renderPlatformBadge(profile, platform.id, platform.label)));

  button.append(title, meta, badges);
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

  row.append(
    heading,
    createTextField(platform.handleLabel, "handle", source?.handle),
    createTextField("Display label", "label", source?.label),
  );

  if (platform.id === "x") {
    row.append(createTextField("Conversation id", "conversationId", source?.conversationId));
  }

  return row;
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

function createPlatformName(labelText) {
  const label = document.createElement("span");
  label.textContent = labelText;
  return label;
}

function createTextField(labelText, name, value) {
  const field = createField(labelText, "profile-field");
  const input = document.createElement("input");
  input.name = name;
  input.type = "text";
  input.value = value || "";
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
  return Array.from(document.querySelectorAll(".profile-editor-card")).map((card) => ({
    expanded: card.classList.contains("is-expanded"),
    id: card.dataset.profileId || "",
    name: card.querySelector('[name="profileName"]').value,
    sources: Object.fromEntries(
      profilePlatforms.map((platform) => [
        platform.id,
        collectSocialSource(card, platform.id),
      ]),
    ),
  }));
}

function collectSocialSource(card, platform) {
  const row = card.querySelector(`[data-platform="${platform}"]`);

  return {
    conversationId: row.querySelector('[name="conversationId"]')?.value || "",
    enabled: row.querySelector('[name="enabled"]').checked,
    handle: row.querySelector('[name="handle"]').value,
    label: row.querySelector('[name="label"]').value,
  };
}

function showLogin() {
  elements.loginPanel.hidden = false;
  elements.editorPanel.hidden = true;
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
