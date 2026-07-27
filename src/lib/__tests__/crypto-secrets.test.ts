import { afterEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  decryptWithUserKey,
  encryptSecret,
  encryptWithUserKey,
} from "@/lib/crypto-secrets";

describe("crypto-secrets", () => {
  const previous = process.env.CREDENTIALS_ENCRYPTION_KEY;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    } else {
      process.env.CREDENTIALS_ENCRYPTION_KEY = previous;
    }
  });

  it("round-trips plaintext with a hex encryption key", () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const ciphertext = encryptSecret("sk-test-secret-value");
    expect(ciphertext.startsWith("v1:")).toBe(true);
    expect(decryptSecret(ciphertext)).toBe("sk-test-secret-value");
  });

  it("produces different ciphertext for the same plaintext", () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const a = encryptSecret("sk-same");
    const b = encryptSecret("sk-same");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("sk-same");
    expect(decryptSecret(b)).toBe("sk-same");
  });

  it("round-trips with a user passphrase", () => {
    const ciphertext = encryptWithUserKey(
      "sk-user-api-key",
      "my-personal-passphrase",
    );
    expect(ciphertext.startsWith("v2:")).toBe(true);
    expect(decryptWithUserKey(ciphertext, "my-personal-passphrase")).toBe(
      "sk-user-api-key",
    );
  });

  it("fails decrypt with the wrong user passphrase", () => {
    const ciphertext = encryptWithUserKey("sk-secret", "correct-passphrase");
    expect(() => decryptWithUserKey(ciphertext, "wrong-passphrase")).toThrow();
  });
});
