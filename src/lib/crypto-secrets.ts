import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const SCRYPT_KEYLEN = 32;
/** scrypt N — balanced for interactive unlock (not every chat token). */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export const MIN_USER_ENCRYPTION_KEY_LENGTH = 12;

function resolveServerEncryptionKeyBytes(): Buffer {
  const explicit = process.env.CREDENTIALS_ENCRYPTION_KEY?.trim();

  if (explicit) {
    if (/^[0-9a-fA-F]{64}$/.test(explicit)) {
      return Buffer.from(explicit, "hex");
    }

    const fromBase64 = Buffer.from(explicit, "base64");
    if (fromBase64.length === 32) {
      return fromBase64;
    }

    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY must be 64 hex chars or 32-byte base64.",
    );
  }

  const clerkSecret = process.env.CLERK_SECRET_KEY?.trim();
  if (clerkSecret) {
    return createHash("sha256")
      .update(`llm-credentials:${clerkSecret}`)
      .digest();
  }

  throw new Error(
    "Set CREDENTIALS_ENCRYPTION_KEY (or CLERK_SECRET_KEY) to protect unlock sessions.",
  );
}

export function isSecretEncryptionConfigured() {
  try {
    resolveServerEncryptionKeyBytes();
    return true;
  } catch {
    return false;
  }
}

function packAesGcm(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function unpackAesGcm(key: Buffer, payload: string): string {
  const [ivB64, tagB64, cipherB64] = payload.split(":");

  if (!ivB64 || !tagB64 || !cipherB64) {
    throw new Error("Invalid encrypted secret format.");
  }

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(cipherB64, "base64");

  if (iv.length !== IV_LENGTH || tag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted secret metadata.");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

/** Encrypt with the server secret (unlock-session cookies). Format: `v1:…`. */
export function encryptSecret(plaintext: string): string {
  const key = resolveServerEncryptionKeyBytes();
  return `v1:${packAesGcm(key, plaintext)}`;
}

export function decryptSecret(payload: string): string {
  const [version, ...rest] = payload.split(":");

  if (version !== "v1" || rest.length !== 3) {
    throw new Error("Invalid encrypted secret format.");
  }

  return unpackAesGcm(resolveServerEncryptionKeyBytes(), rest.join(":"));
}

export function normalizeUserEncryptionKey(value: string) {
  return value.trim();
}

export function isPlausibleUserEncryptionKey(value: string) {
  return (
    normalizeUserEncryptionKey(value).length >= MIN_USER_ENCRYPTION_KEY_LENGTH
  );
}

function deriveKeyFromPassphrase(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
}

/**
 * Encrypt with a user-supplied passphrase (never stored).
 * Format: `v2:<salt_b64>:<iv_b64>:<tag_b64>:<cipher_b64>`.
 */
export function encryptWithUserKey(plaintext: string, passphrase: string): string {
  const normalized = normalizeUserEncryptionKey(passphrase);
  if (!isPlausibleUserEncryptionKey(normalized)) {
    throw new Error(
      `Encryption key must be at least ${MIN_USER_ENCRYPTION_KEY_LENGTH} characters.`,
    );
  }

  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKeyFromPassphrase(normalized, salt);
  const packed = packAesGcm(key, plaintext);

  return `v2:${salt.toString("base64")}:${packed}`;
}

export function decryptWithUserKey(payload: string, passphrase: string): string {
  const [version, saltB64, ivB64, tagB64, cipherB64] = payload.split(":");

  if (
    version !== "v2" ||
    !saltB64 ||
    !ivB64 ||
    !tagB64 ||
    !cipherB64
  ) {
    throw new Error("Invalid user-encrypted secret format.");
  }

  const salt = Buffer.from(saltB64, "base64");
  if (salt.length !== SALT_LENGTH) {
    throw new Error("Invalid user-encrypted secret salt.");
  }

  const key = deriveKeyFromPassphrase(
    normalizeUserEncryptionKey(passphrase),
    salt,
  );

  return unpackAesGcm(key, `${ivB64}:${tagB64}:${cipherB64}`);
}

export function isUserEncryptedSecret(payload: string) {
  return payload.startsWith("v2:");
}
