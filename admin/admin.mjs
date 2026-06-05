const platformOptions = [
  ["twitch", "Twitch"],
  ["kick", "Kick"],
  ["x", "X"],
  ["room", "MarketBubble.com"],
];

const elements = {
  addSourceButton: document.querySelector("#addSourceButton"),
  editorPanel: document.querySelector("#editorPanel"),
  loginForm: document.querySelector("#loginForm"),
  loginPanel: document.querySelector("#loginPanel"),
  logoutButton: document.querySelector("#logoutButton"),
  saveSourcesButton: document.querySelector("#saveSourcesButton"),
  sourceRows: document.querySelector("#sourceRows"),
  status: document.querySelector("#adminStatus"),
};

let sources = [];

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

elements.addSourceButton.addEventListener("click", () => {
  sources.push({
    enabled: true,
    platform: "twitch",
    sourceHandle: "",
    sourceName: "",
    conversationId: "",
  });
  renderSources();
});

elements.saveSourcesButton.addEventListener("click", async () => {
  const response = await requestApi("/api/admin/sources", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sources: collectSources() }),
  });

  if (!response.ok) {
    showStatus(await readError(response));
    return;
  }

  const body = await response.json();
  sources = body.sources;
  renderSources();
  showStatus("Saved.");
});

elements.logoutButton.addEventListener("click", async () => {
  await requestApi("/api/admin/logout", { method: "POST" });
  sources = [];
  renderSources();
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
  sources = body.sources;
  renderSources();
  showEditor();
}

function renderSources() {
  elements.sourceRows.replaceChildren(...sources.map(renderSourceRow));
}

function renderSourceRow(source, index) {
  const row = document.createElement("article");
  row.className = "source-editor-row";
  row.dataset.index = String(index);

  row.append(
    createCheckboxField("Enabled", "enabled", source.enabled),
    createSelectField("Platform", "platform", source.platform),
    createTextField("Label", "sourceName", source.sourceName),
    createTextField("Handle", "sourceHandle", source.sourceHandle),
    createTextField("X conversation", "conversationId", source.conversationId),
    createRemoveButton(index),
  );

  return row;
}

function collectSources() {
  return Array.from(document.querySelectorAll(".source-editor-row")).map((row) => ({
    enabled: row.querySelector('[name="enabled"]').checked,
    platform: row.querySelector('[name="platform"]').value,
    sourceName: row.querySelector('[name="sourceName"]').value,
    sourceHandle: row.querySelector('[name="sourceHandle"]').value,
    conversationId: row.querySelector('[name="conversationId"]').value,
  }));
}

function createCheckboxField(label, name, checked) {
  const field = createField(label);
  const input = document.createElement("input");
  input.name = name;
  input.type = "checkbox";
  input.checked = checked !== false;
  field.append(input);
  return field;
}

function createSelectField(label, name, value) {
  const field = createField(label);
  const select = document.createElement("select");
  select.name = name;

  for (const [optionValue, optionLabel] of platformOptions) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionLabel;
    option.selected = optionValue === value;
    select.append(option);
  }

  field.append(select);
  return field;
}

function createTextField(label, name, value) {
  const field = createField(label);
  const input = document.createElement("input");
  input.name = name;
  input.type = "text";
  input.value = value || "";
  field.append(input);
  return field;
}

function createRemoveButton(index) {
  const button = document.createElement("button");
  button.className = "source-remove";
  button.type = "button";
  button.textContent = "Remove";
  button.addEventListener("click", () => {
    sources.splice(index, 1);
    renderSources();
  });
  return button;
}

function createField(labelText) {
  const label = document.createElement("label");
  label.className = "source-field";
  const span = document.createElement("span");
  span.textContent = labelText;
  label.append(span);
  return label;
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
