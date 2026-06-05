export function createChatEventHub() {
  const clients = new Set();

  return {
    get clientCount() {
      return clients.size;
    },

    connect(response) {
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
      });
      response.write(": connected\n\n");

      clients.add(response);
      response.on("close", () => {
        clients.delete(response);
      });

      return response;
    },

    broadcast(eventName, payload) {
      const event = formatSseEvent(eventName, payload);

      for (const response of clients) {
        response.write(event);
      }
    },
  };
}

export function formatSseEvent(eventName, payload) {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}
