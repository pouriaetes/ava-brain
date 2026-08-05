// Encryption for api_keys, password hashing, session signing
// Uses Web Crypto API (available in Cloudflare Workers)

const ALGORITHM = { name: "AES-GCM", length: 256 };

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function deriveKeyBytes(masterKey, purpose) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode((masterKey + purpose).slice(0, 128)),
    { name: "HKDF" },
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      info: encoder.encode("ava_brain"),
      salt: new Uint8Array(0),
    },
    keyMaterial,
    128
  );
  return new Uint8Array(derived);
}

export async function encrypt(plaintext, masterKey) {
  if (!plaintext || !masterKey) return "";
  const keyBytes = await deriveKeyBytes(masterKey, "encrypt");
  const key = await crypto.subtle.importKey("raw", keyBytes, ALGORITHM, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encoder.encode(plaintext)
  );
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToHex(combined);
}

export async function decrypt(cipherHex, masterKey) {
  if (!cipherHex || !masterKey) return "";
  try {
    const combined = hexToBytes(cipherHex);
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const keyBytes = await deriveKeyBytes(masterKey, "encrypt");
    const key = await crypto.subtle.importKey("raw", keyBytes, ALGORITHM, false, ["decrypt"]);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return "";
  }
}

// Password hashing with PBKDF2
export async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(salt),
      iterations: 100000,
    },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

export function generateSalt() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
}

// Admin session
export async function createSession(userId, username, secret, mustChangePassword = false) {
  const encoder = new TextEncoder();
  const payload = JSON.stringify({ userId, username, mustChangePassword: !!mustChangePassword, created: Date.now() });
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    { name: "HMAC", hash: "SHA-256" },
    key,
    encoder.encode(payload)
  );
  const token = bytesToHex(new Uint8Array(sig));
  return { token, payload };
}

export async function verifySession(token, payload, secret) {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sig = hexToBytes(token);
    return crypto.subtle.verify(
      { name: "HMAC", hash: "SHA-256" },
      key,
      sig,
      encoder.encode(payload)
    );
  } catch {
    return false;
  }
}