import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { createShutdownHandler } from "../../src/infrastructure/http/shutdown.js";

describe("graceful shutdown", () => {
  it("closes the HTTP server and disconnects the database once", async () => {
    const server = createServer((_req, res) => {
      res.end("ok");
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    let disconnects = 0;
    const shutdown = createShutdownHandler({
      server,
      disconnect: async () => {
        disconnects += 1;
      },
    });

    await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT")]);

    expect(disconnects).toBe(1);
    expect(server.listening).toBe(false);
  });

  it("disconnects the database when the HTTP server fails to close", async () => {
    const server = createServer();
    let disconnects = 0;
    const shutdown = createShutdownHandler({
      server,
      disconnect: async () => {
        disconnects += 1;
      },
    });

    await expect(shutdown("SIGTERM")).rejects.toThrow();
    expect(disconnects).toBe(1);
  });
});
