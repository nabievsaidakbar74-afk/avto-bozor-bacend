import { argon2id, hash, verify, type HashOptions } from "argon2";
import { AppError } from "../errors/app-error.js";

const hashOptions: HashOptions = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

function assertPasswordPolicy(plainPassword: string): void {
  const hasLetter = /[A-Za-z]/.test(plainPassword);
  const hasNumber = /\d/.test(plainPassword);
  if (plainPassword.length < 8 || plainPassword.length > 128 || !hasLetter || !hasNumber) {
    throw new AppError(
      "Password must be 8 to 128 characters and include a letter and a number",
      400,
      "WEAK_PASSWORD",
    );
  }
}

export async function hashPassword(plainPassword: string): Promise<string> {
  assertPasswordPolicy(plainPassword);
  return hash(plainPassword, hashOptions);
}

let dummyHashPromise: Promise<string> | undefined;

function dummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hash("not-a-real-account-password", hashOptions);
  return dummyHashPromise;
}

export async function verifyPassword(
  passwordHash: string,
  plainPassword: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, plainPassword);
  } catch {
    return false;
  }
}

/** Runs a real Argon2 verify even when the account does not exist. */
export async function verifyPasswordForLogin(
  passwordHash: string | null,
  plainPassword: string,
): Promise<boolean> {
  const digest = passwordHash ?? (await dummyPasswordHash());
  return verifyPassword(digest, plainPassword);
}
