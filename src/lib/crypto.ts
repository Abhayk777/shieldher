/**
 * ShieldHer Client-Side Encryption Library
 * 
 * Zero Admin Access: All encryption/decryption happens in the user's browser.
 * Uses Web Crypto API (AES-256-GCM) — built into all modern browsers.
 * The server never sees plaintext data.
 */

const PBKDF2_ITERATIONS = 600000;
const SALT_LENGTH = 16; // 128 bits
const IV_LENGTH = 12;   // 96 bits for AES-GCM
const TAG_LENGTH = 128; // 128 bits for AES-GCM

// ═══ KEY DERIVATION ═══

/**
 * Generate a random salt for a new user.
 */
export function generateSalt(): string {
  const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH)) as any;
  return uint8ArrayToBase64(salt);
}

/**
 * Derive a 256-bit AES-GCM key from a password + salt using PBKDF2.
 * The derived key never leaves the browser.
 */
export async function deriveKey(password: string, saltBase64: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const salt = base64ToUint8Array(saltBase64);

  // Import the password as raw key material
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive the actual AES-GCM key
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true, // extractable — needed for sessionStorage export
    ['encrypt', 'decrypt']
  );
}

// ═══ ENCRYPT / DECRYPT TEXT ═══

export interface EncryptedPayload {
  iv: string;       // base64-encoded IV
  ciphertext: string; // base64-encoded encrypted data
}

/**
 * Encrypt a string (e.g. JSON) using AES-256-GCM.
 */
export async function encryptText(key: CryptoKey, plaintext: string): Promise<EncryptedPayload> {
  const encoder = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH)) as any;

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: TAG_LENGTH },
    key,
    encoder.encode(plaintext)
  );

  return {
    iv: uint8ArrayToBase64(iv),
    ciphertext: uint8ArrayToBase64(new Uint8Array(ciphertext)),
  };
}

/**
 * Decrypt an EncryptedPayload back to a string.
 */
export async function decryptText(key: CryptoKey, payload: EncryptedPayload): Promise<string> {
  const iv = base64ToUint8Array(payload.iv);
  const ciphertext = base64ToUint8Array(payload.ciphertext);

  const plaintext = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any, tagLength: TAG_LENGTH },
    key,
    ciphertext as any
  );

  return new TextDecoder().decode(plaintext);
}

// ═══ ENCRYPT / DECRYPT FILES (IMAGES) ═══

export interface EncryptedFile {
  iv: string;             // base64-encoded IV
  encryptedBlob: Blob;    // encrypted binary data
}

/**
 * Encrypt a File (image) using AES-256-GCM.
 */
export async function encryptFile(key: CryptoKey, file: File): Promise<EncryptedFile> {
  const arrayBuffer = await file.arrayBuffer();
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH)) as any;

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: TAG_LENGTH },
    key,
    arrayBuffer
  );

  return {
    iv: uint8ArrayToBase64(iv),
    encryptedBlob: new Blob([ciphertext], { type: 'application/octet-stream' }),
  };
}

/**
 * Decrypt an encrypted blob back to an image Blob.
 */
export async function decryptFile(
  key: CryptoKey,
  encryptedData: ArrayBuffer,
  ivBase64: string,
  mimeType: string = 'image/png'
): Promise<Blob> {
  const iv = base64ToUint8Array(ivBase64);

  const plaintext = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any, tagLength: TAG_LENGTH },
    key,
    encryptedData
  );

  return new Blob([plaintext], { type: mimeType });
}

// ═══ KEY STORAGE (MEMORY ONLY — WIPED ON RELOAD) ═══

let memoizedKey: CryptoKey | null = null;
let memoizedSalt: string | null = null;

/**
 * Store the CryptoKey and salt in memory.
 * This will be lost as soon as the page is reloaded or the tab is closed.
 */
export async function storeKey(key: CryptoKey, salt: string): Promise<void> {
  memoizedKey = key;
  memoizedSalt = salt;
}

/**
 * Retrieve the CryptoKey from memory.
 * Returns null if no key is stored (user needs to re-authenticate or unlock vault).
 */
export async function retrieveKey(): Promise<CryptoKey | null> {
  return memoizedKey;
}

/**
 * Clear the stored encryption key (on logout).
 */
export function clearKey(): void {
  memoizedKey = null;
  memoizedSalt = null;
}

/**
 * Get the stored salt from memory.
 */
export function getStoredSalt(): string | null {
  return memoizedSalt;
}

// ═══ UTILITY: Base64 ↔ Uint8Array ═══

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
