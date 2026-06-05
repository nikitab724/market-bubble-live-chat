import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { hashPassword } from "../src/admin-auth.mjs";
import { createAppServer } from "../server.mjs";

describe("server contract", () => {
  it("protects admin APIs with a server-side session cookie", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mb-admin-"));
    const configPath = join(tempDir, "sources.json");
    await writeFile(
      configPath,
      JSON.stringify({
        sources: [{ platform: "twitch", sourceName: "Market Bubble", sourceHandle: "marketbubble" }],
      }),
    );

    const server = createAppServer({
      adminPasswordHash: await hashPassword("secret", {
        iterations: 1200,
        salt: "00112233445566778899aabbccddeeff",
      }),
      configPath,
      rootDir: fileURLToPath(new URL("..", import.meta.url)),
      secureCookies: false,
    });
    await listen(server);

    try {
      const publicConfig = await request(server, "GET", "/api/public-config");
      assert.equal(publicConfig.status, 200);
      assert.equal(publicConfig.json.sources[0].sourceId, "twitch-marketbubble");

      const privateFile = await request(server, "GET", "/server.mjs");
      assert.equal(privateFile.status, 404);

      const blocked = await request(server, "GET", "/api/admin/sources");
      assert.equal(blocked.status, 401);

      const badLogin = await request(server, "POST", "/api/admin/login", { password: "wrong" });
      assert.equal(badLogin.status, 401);

      const login = await request(server, "POST", "/api/admin/login", { password: "secret" });
      assert.equal(login.status, 204);
      assert.match(login.headers.get("set-cookie"), /mb_admin=/);
      assert.match(login.headers.get("set-cookie"), /HttpOnly/);
      assert.match(login.headers.get("set-cookie"), /SameSite=Strict/);

      const cookie = login.headers.get("set-cookie").split(";")[0];
      const adminSources = await request(server, "GET", "/api/admin/sources", null, cookie);
      assert.equal(adminSources.status, 200);
      assert.equal(adminSources.json.sources[0].platform, "twitch");

      const update = await request(
        server,
        "PUT",
        "/api/admin/sources",
        {
          sources: [
            { platform: "twitch", sourceName: "Market Bubble", sourceHandle: "marketbubble" },
            { platform: "x", sourceName: "Banks", sourceHandle: "Banks", conversationId: "2062574325970973093" },
          ],
        },
        cookie,
      );
      assert.equal(update.status, 200);
      assert.equal(update.json.sources.length, 2);

      const saved = JSON.parse(await readFile(configPath, "utf8"));
      assert.equal(saved.sources[1].sourceId, "x-banks");
    } finally {
      await close(server);
    }
  });
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function request(server, method, path, body, cookie = "") {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();

  return {
    headers: response.headers,
    json: isJson(response) && text ? JSON.parse(text) : null,
    status: response.status,
    text,
  };
}

function isJson(response) {
  return response.headers.get("content-type")?.includes("application/json");
}
