import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { logRedactPaths, redactSensitiveText } from "../../src/config/logger.js";

describe("log redaction", () => {
  it("removes cookies, tokens, passwords, and payment secrets", async () => {
    let line = "";
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        line += chunk.toString();
        callback();
      },
    });
    const log = pino({ redact: { paths: [...logRedactPaths], censor: "[REDACTED]" } }, stream);
    log.info(
      {
        req: { headers: { cookie: "refreshToken=secret-value", authorization: "Bearer secret-token" } },
        refreshToken: "raw-refresh-token",
        accessToken: "raw-access-token",
        password: "Password1",
        passwordHash: "$argon2id$hash",
        jwt: "header.payload.signature",
        cvv: "123",
        cardNumber: "4242424242424242",
        clientSecret: "pay-secret",
        DATABASE_URL: "postgresql://user:secret@127.0.0.1:5432/avto_bozor",
      },
      "request",
    );
    await new Promise((resolve) => stream.write("", resolve));
    expect(line).not.toContain("secret-value");
    expect(line).not.toContain("secret-token");
    expect(line).not.toContain("raw-refresh-token");
    expect(line).not.toContain("raw-access-token");
    expect(line).not.toContain("Password1");
    expect(line).not.toContain("$argon2id$hash");
    expect(line).not.toContain("header.payload.signature");
    expect(line).not.toContain("4242424242424242");
    expect(line).not.toContain("pay-secret");
    expect(line).not.toContain("postgresql://");
    expect(line).toContain("[REDACTED]");
  });

  it("removes connection strings and JWTs from error text", () => {
    const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signaturevalue";
    const redacted = redactSensitiveText(
      `failed postgresql://avto_bozor:secret@127.0.0.1:5432/avto_bozor password=Password1 token=${token}`,
    );
    expect(redacted).not.toContain("postgresql://");
    expect(redacted).not.toContain("Password1");
    expect(redacted).not.toContain(token);
  });
});
