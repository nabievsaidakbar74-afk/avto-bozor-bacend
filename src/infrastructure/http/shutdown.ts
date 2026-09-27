import type { Server } from "node:http";

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

export function createShutdownHandler(input: {
  server: Server;
  disconnect: () => Promise<void>;
  timeoutMs?: number;
}): (signal: string) => Promise<void> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  let pending: Promise<void> | undefined;

  return (_signal: string) => {
    if (pending) {
      return pending;
    }
    pending = shutdownOnce(input.server, input.disconnect, timeoutMs);
    return pending;
  };
}

async function shutdownOnce(
  server: Server,
  disconnect: () => Promise<void>,
  timeoutMs: number,
): Promise<void> {
  let closeError: unknown;
  try {
    await closeServer(server, timeoutMs);
  } catch (error) {
    closeError = error;
  }

  try {
    await disconnect();
  } catch (error) {
    closeError = closeError ?? error;
  }

  if (closeError) {
    throw closeError;
  }
}

function closeServer(server: Server, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("HTTP server close timed out"));
    }, timeoutMs);
    timer.unref();

    server.close((error) => {
      clearTimeout(timer);
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
