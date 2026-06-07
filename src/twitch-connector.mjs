const IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
const RECONNECT_DELAY_MS = 5000;

/**
 * Connects to Twitch chat anonymously (no OAuth required for read-only).
 *
 * @param {string} channel  - Twitch channel name, e.g. "marketbubble"
 * @param {object} handlers
 * @param {function} handlers.onMessage    - Called with a normalized-ready message object
 * @param {function} handlers.onStatus     - Called with "connecting" | "connected" | "disconnected"
 * @returns {{ disconnect: function }}
 */
export function connectTwitchChat(channel, { onMessage, onStatus, source } = {}) {
  const channelName = channel.toLowerCase().replace(/^#/, "");
  const sourceMeta = source || {
    sourceHandle: channelName,
    sourceId: `twitch-${channelName}`,
    sourceLabel: channelName,
    sourceName: channelName,
  };
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
      const emotes = parseTwitchEmoteTag(trailing, tags.emotes);

      const message = {
        id: tags.id ? `twitch-${tags.id}` : undefined,
        platform: "twitch",
        author: displayName,
        authorColor: tags.color || "",
        handle: login,
        body: trailing,
        timestamp: new Date(sentTs).toISOString(),
        sourceUrl: `https://twitch.tv/${login}`,
        sourceId: sourceMeta.sourceId,
        sourceName: sourceMeta.sourceName,
        sourceHandle: sourceMeta.sourceHandle || channelName,
        sourceLabel: sourceMeta.sourceLabel || sourceMeta.sourceName,
      };
      if (emotes.length > 0) {
        message.emotes = emotes;
      }

      onMessage?.(message);
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

export function parseTwitchEmoteTag(body, emoteTag = "") {
  if (!emoteTag) return [];

  return emoteTag
    .split("/")
    .flatMap((entry) => {
      const [id, ranges = ""] = entry.split(":");
      return ranges.split(",").map((range) => {
        const [start, end] = range.split("-").map((value) => Number.parseInt(value, 10));
        const name = body.slice(start, end + 1);

        return {
          end,
          id,
          name,
          provider: "twitch",
          start,
          url: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`,
        };
      });
    })
    .filter((emote) => emote.id && Number.isInteger(emote.start) && Number.isInteger(emote.end));
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
