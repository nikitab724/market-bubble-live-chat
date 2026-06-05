const IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
const RECONNECT_DELAY_MS = 5000;
const MAX_MESSAGES = 60;

/**
 * Connects to Twitch chat anonymously (no OAuth required for read-only).
 *
 * @param {string} channel  - Twitch channel name, e.g. "marketbubble"
 * @param {object} handlers
 * @param {function} handlers.onMessage    - Called with a normalized-ready message object
 * @param {function} handlers.onStatus     - Called with "connecting" | "connected" | "disconnected"
 * @returns {{ disconnect: function }}
 */
export function connectTwitchChat(channel, { onMessage, onStatus } = {}) {
  const channelName = channel.toLowerCase().replace(/^#/, "");
  const nick = `justinfan${Math.floor(100000 + Math.random() * 900000)}`;

  let ws = null;
  let active = true;
  let reconnectTimer = null;

  function emit(status) {
    onStatus?.(status);
  }

  function connect() {
    emit("connecting");
    ws = new WebSocket(IRC_URL);

    ws.addEventListener("open", () => {
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send(`NICK ${nick}`);
      ws.send(`JOIN #${channelName}`);
    });

    ws.addEventListener("message", (event) => {
      for (const line of event.data.split("\r\n")) {
        if (line) handleLine(line);
      }
    });

    ws.addEventListener("close", () => {
      emit("disconnected");
      if (active) {
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    });

    ws.addEventListener("error", () => {
      ws.close();
    });
  }

  function handleLine(line) {
    if (line.startsWith("PING")) {
      ws.send("PONG :tmi.twitch.tv");
      return;
    }

    const { tags, prefix, command, params, trailing } = parseLine(line);

    if (command === "001") {
      emit("connected");
    }

    if (command === "PRIVMSG") {
      const login = prefix.split("!")[0];
      const displayName = tags["display-name"] || login;
      const sentTs = tags["tmi-sent-ts"] ? parseInt(tags["tmi-sent-ts"], 10) : Date.now();

      onMessage?.({
        platform: "twitch",
        author: displayName,
        handle: login,
        body: trailing,
        timestamp: new Date(sentTs).toISOString(),
        sourceUrl: `https://twitch.tv/${login}`,
        sourceId: "twitch-marketbubble",
        sourceName: "Market Bubble",
        sourceHandle: channelName,
        sourceLabel: "Market Bubble",
      });
    }
  }

  connect();

  return {
    disconnect() {
      active = false;
      clearTimeout(reconnectTimer);
      ws?.close();
    },
  };
}

function parseLine(line) {
  let rest = line;
  const tags = {};

  if (rest.startsWith("@")) {
    const spaceIdx = rest.indexOf(" ");
    const tagStr = rest.slice(1, spaceIdx);
    rest = rest.slice(spaceIdx + 1);

    for (const part of tagStr.split(";")) {
      const eqIdx = part.indexOf("=");
      if (eqIdx !== -1) {
        tags[part.slice(0, eqIdx)] = decodeTagValue(part.slice(eqIdx + 1));
      }
    }
  }

  let prefix = "";
  if (rest.startsWith(":")) {
    const spaceIdx = rest.indexOf(" ");
    prefix = rest.slice(1, spaceIdx);
    rest = rest.slice(spaceIdx + 1);
  }

  const trailingIdx = rest.indexOf(" :");
  const trailing = trailingIdx !== -1 ? rest.slice(trailingIdx + 2) : "";
  const commandStr = trailingIdx !== -1 ? rest.slice(0, trailingIdx) : rest;
  const [command, ...params] = commandStr.split(" ");

  return { tags, prefix, command, params, trailing };
}

function decodeTagValue(value) {
  return value
    .replaceAll("\\:", ";")
    .replaceAll("\\s", " ")
    .replaceAll("\\\\", "\\")
    .replaceAll("\\r", "\r")
    .replaceAll("\\n", "\n");
}
