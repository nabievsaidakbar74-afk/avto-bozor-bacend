import { randomInt, randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { PrismaService } from "../../src/infrastructure/prisma/prisma.service.js";

const password = "Password1";
const createdEmails: string[] = [];

function uniqueEmail(): string {
  const email = `auth.${randomUUID()}@example.com`;
  createdEmails.push(email);
  return email;
}

function uniquePhone(): string {
  return `+998${randomInt(100_000_000, 1_000_000_000).toString()}`;
}

function cookieHeader(setCookie: string | string[] | undefined): string {
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!value) {
    throw new Error("Refresh cookie was not set");
  }
  const pair = value.split(";")[0];
  if (!pair) {
    throw new Error("Refresh cookie was not set");
  }
  return pair;
}

describe("auth API", () => {
  const app = createApp();

  afterAll(async () => {
    await PrismaService.client().user.deleteMany({
      where: { email: { in: createdEmails } },
    });
    await PrismaService.disconnect();
  });

  it("registers, rejects duplicates, signs in, and reads /me", async () => {
    const email = uniqueEmail();
    const phone = uniquePhone();

    const registered = await request(app).post("/api/v1/auth/register").send({
      email: email.toUpperCase(),
      phone,
      password,
      firstName: "Test",
      lastName: "User",
    });

    expect(registered.status).toBe(201);
    expect(registered.body.data.user.email).toBe(email);
    expect(registered.body.data.user.role).toBe("USER");
    expect(registered.body.data.user.status).toBe("ACTIVE");
    expect(registered.body.data.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(registered.body)).not.toContain(password);

    const duplicateEmail = await request(app).post("/api/v1/auth/register").send({
      email,
      phone: uniquePhone(),
      password,
      firstName: "Test",
      lastName: "User",
    });
    expect(duplicateEmail.status).toBe(409);
    expect(duplicateEmail.body.code).toBe("EMAIL_TAKEN");

    const duplicatePhone = await request(app).post("/api/v1/auth/register").send({
      email: uniqueEmail(),
      phone,
      password,
      firstName: "Test",
      lastName: "User",
    });
    expect(duplicatePhone.status).toBe(409);
    expect(duplicatePhone.body.code).toBe("PHONE_TAKEN");

    const invalidPassword = await request(app).post("/api/v1/auth/login").send({
      email,
      password: "Wrong-password1",
    });
    const unknownEmail = await request(app).post("/api/v1/auth/login").send({
      email: uniqueEmail(),
      password,
    });
    expect(invalidPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(invalidPassword.body).toEqual(unknownEmail.body);
    expect(invalidPassword.body.message).toBe("Invalid email or password");

    const unauthenticated = await request(app).get("/api/v1/auth/me");
    expect(unauthenticated.status).toBe(401);

    const login = await request(app).post("/api/v1/auth/login").send({ email, password });
    expect(login.status).toBe(200);
    expect(typeof login.body.data.accessToken).toBe("string");
    const payloadPart = login.body.data.accessToken.split(".")[1] as string;
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString()) as {
      sub: string;
      role: string;
      email?: string;
    };
    expect(payload.sub).toBe(registered.body.data.user.id);
    expect(payload.role).toBe("USER");
    expect(payload.email).toBeUndefined();
    const refreshCookie = cookieHeader(login.headers["set-cookie"]);
    expect(refreshCookie.startsWith("refreshToken=")).toBe(true);
    expect(String(login.headers["set-cookie"])).toMatch(/HttpOnly/i);

    const me = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(email);
    expect(me.body.data.user.passwordHash).toBeUndefined();
  });

  it("rotates a refresh token and rejects the previous token", async () => {
    const email = uniqueEmail();
    const phone = uniquePhone();
    await request(app).post("/api/v1/auth/register").send({
      email,
      phone,
      password,
      firstName: "Refresh",
      lastName: "User",
    });

    const login = await request(app).post("/api/v1/auth/login").send({ email, password });
    const firstCookie = cookieHeader(login.headers["set-cookie"]);

    const refreshed = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", firstCookie)
      .set("Content-Type", "application/json")
      .send({});
    expect(refreshed.status).toBe(200);
    expect(typeof refreshed.body.data.accessToken).toBe("string");
    const rotatedCookie = cookieHeader(refreshed.headers["set-cookie"]);
    expect(rotatedCookie).not.toBe(firstCookie);

    const rotatedAgain = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", rotatedCookie)
      .set("Content-Type", "application/json")
      .send({});
    expect(rotatedAgain.status).toBe(200);

    const reused = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", firstCookie)
      .set("Content-Type", "application/json")
      .send({});
    expect(reused.status).toBe(401);
  });

  it("revokes the refresh token on logout", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/v1/auth/register").send({
      email,
      phone: uniquePhone(),
      password,
      firstName: "Logout",
      lastName: "User",
    });

    const login = await request(app).post("/api/v1/auth/login").send({ email, password });
    const refreshCookie = cookieHeader(login.headers["set-cookie"]);

    const logout = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", refreshCookie)
      .set("Content-Type", "application/json")
      .send({});
    expect(logout.status).toBe(200);
    expect(String(logout.headers["set-cookie"])).toMatch(/refreshToken=/);

    const revoked = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie)
      .set("Content-Type", "application/json")
      .send({});
    expect(revoked.status).toBe(401);
  });

  it("rejects cookie refresh and logout that are not JSON requests", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/v1/auth/register").send({
      email,
      phone: uniquePhone(),
      password,
      firstName: "Csrf",
      lastName: "User",
    });
    const login = await request(app).post("/api/v1/auth/login").send({ email, password });
    const refreshCookie = cookieHeader(login.headers["set-cookie"]);

    const refresh = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie)
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send("refresh=1");
    expect(refresh.status).toBe(415);
    expect(refresh.body.code).toBe("UNSUPPORTED_MEDIA_TYPE");

    const logout = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", refreshCookie)
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send("logout=1");
    expect(logout.status).toBe(415);

    const stillValid = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie)
      .set("Content-Type", "application/json")
      .send({});
    expect(stillValid.status).toBe(200);
  });

  it("rate limits repeated login attempts", async () => {
    const header = { "x-test-rate-limit": "enforce" };
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await request(app).post("/api/v1/auth/login").set(header).send({
        email: "not-an-email",
        password: "wrong",
      });
      expect(response.status).toBe(422);
    }
    const blocked = await request(app).post("/api/v1/auth/login").set(header).send({
      email: "not-an-email",
      password: "wrong",
    });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
  });
});
