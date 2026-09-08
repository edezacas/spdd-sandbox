import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export interface User {
  id: string;
  username: string;
  passwordHash: string; // opaque; `salt:hash` hex produced by hashPassword
}

const users: User[] = [];

export function addUser(user: User): User {
  users.push(user);
  return user;
}

export function getUserByUsername(username: string): User | undefined {
  return users.find((u) => u.username === username);
}

const SALT_BYTES = 16;
const KEY_BYTES = 64;

export function hashPassword(plainPassword: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const hash = scryptSync(plainPassword, salt, KEY_BYTES).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(plainPassword: string, passwordHash: string): boolean {
  const [salt, hash] = passwordHash.split(":");
  if (!salt || !hash) {
    return false;
  }
  const candidate = scryptSync(plainPassword, salt, KEY_BYTES);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(candidate, expected);
}
