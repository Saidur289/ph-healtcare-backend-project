import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { envVars } from "../config/env";

// Application-level encryption for the most sensitive columns (free-text health notes,
// medical report names, prescription contents). AES-256-GCM, random IV per value.
// Stored format: "enc:v1:<iv>:<auth tag>:<ciphertext>" (base64). Values without the prefix
// are old plain text and are returned unchanged, so rows can be migrated gradually.
const PREFIX = "enc:v1:";
const key = Buffer.from(envVars.DATA_ENCRYPTION_KEY, "base64");

export const isEncrypted = (value: unknown): value is string => typeof value === "string" && value.startsWith(PREFIX);

export const encryptText = (value: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
};

export const decryptText = (value: string): string => {
  if (!isEncrypted(value)) return value;
  const [iv, tag, data] = value.slice(PREFIX.length).split(":");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
};

// null / undefined pass through (optional columns)
export const encryptOptional = <T extends string | null | undefined>(value: T): T =>
  (typeof value === "string" && value !== "" ? encryptText(value) : value) as T;
export const decryptOptional = <T extends string | null | undefined>(value: T): T =>
  (typeof value === "string" ? decryptText(value) : value) as T;

// JSON columns (prescription medicines): stored as one encrypted JSON string
export const encryptJson = (value: unknown): string => encryptText(JSON.stringify(value));
export const decryptJson = <T>(value: unknown): T => (isEncrypted(value) ? (JSON.parse(decryptText(value)) as T) : (value as T));
