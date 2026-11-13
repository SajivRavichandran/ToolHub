/**
 * Framework-free JWT signing, verification and decoding.
 *
 * Built on the `jose` library, which uses the Web Crypto API (available as
 * `globalThis.crypto` in modern browsers and Node 20+). No network calls,
 * no secrets logged. Imported by both the React component and Vitest (Node).
 */
import {
  SignJWT,
  compactVerify,
  generateKeyPair,
  exportPKCS8,
  exportSPKI,
  exportJWK,
  importPKCS8,
  importSPKI,
  importX509,
  importJWK,
  decodeProtectedHeader,
  type JWK,
} from "jose";
import * as asn1js from "asn1js";

// ---------------------------------------------------------------------------
// Algorithms
// ---------------------------------------------------------------------------

export type AlgKind = "HMAC" | "RSA" | "EC" | "PSS";

export interface AlgInfo {
  alg: string;
  kind: AlgKind;
  label: string;
  /** Curve for EC algorithms. */
  curve?: "P-256" | "P-384" | "P-521";
  /** Recommended HMAC secret size in bytes (= hash output size). */
  secretBytes?: number;
}

export const ALGORITHMS: AlgInfo[] = [
  { alg: "HS256", kind: "HMAC", label: "HS256 (HMAC + SHA-256)", secretBytes: 32 },
  { alg: "HS384", kind: "HMAC", label: "HS384 (HMAC + SHA-384)", secretBytes: 48 },
  { alg: "HS512", kind: "HMAC", label: "HS512 (HMAC + SHA-512)", secretBytes: 64 },
  { alg: "RS256", kind: "RSA", label: "RS256 (RSA + SHA-256)" },
  { alg: "RS384", kind: "RSA", label: "RS384 (RSA + SHA-384)" },
  { alg: "RS512", kind: "RSA", label: "RS512 (RSA + SHA-512)" },
  { alg: "ES256", kind: "EC", label: "ES256 (ECDSA P-256)", curve: "P-256" },
  { alg: "ES384", kind: "EC", label: "ES384 (ECDSA P-384)", curve: "P-384" },
  { alg: "ES512", kind: "EC", label: "ES512 (ECDSA P-521)", curve: "P-521" },
  { alg: "PS256", kind: "PSS", label: "PS256 (RSA-PSS + SHA-256)" },
  { alg: "PS384", kind: "PSS", label: "PS384 (RSA-PSS + SHA-384)" },
  { alg: "PS512", kind: "PSS", label: "PS512 (RSA-PSS + SHA-512)" },
];

const ALG_MAP = new Map(ALGORITHMS.map((a) => [a.alg, a]));

export function getAlgInfo(alg: string): AlgInfo | undefined {
  return ALG_MAP.get(alg);
}

export function isHmac(alg: string): boolean {
  return getAlgInfo(alg)?.kind === "HMAC";
}

export function isAsymmetric(alg: string): boolean {
  const k = getAlgInfo(alg)?.kind;
  return k === "RSA" || k === "EC" || k === "PSS";
}

// ---------------------------------------------------------------------------
// base64 / base64url helpers (work in browser + Node)
// ---------------------------------------------------------------------------

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  return base64ToBytes(b64 + pad);
}

function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Interpret a user-supplied secret as bytes (optionally base64-decoded). */
export function secretToBytes(secret: string, base64Encoded = false): Uint8Array {
  if (base64Encoded) {
    try {
      // Accept both base64 and base64url.
      return base64urlToBytes(secret.trim());
    } catch {
      throw new Error("Secret is not valid base64.");
    }
  }
  return new TextEncoder().encode(secret);
}

// ---------------------------------------------------------------------------
// Key / secret generation
// ---------------------------------------------------------------------------

/** Generate a cryptographically strong secret sized for the HMAC algorithm. */
export function generateSecret(alg: string): string {
  const info = getAlgInfo(alg);
  const bytes = info?.secretBytes ?? 32;
  const buf = new Uint8Array(bytes);
  (globalThis.crypto as Crypto).getRandomValues(buf);
  return bytesToBase64url(buf);
}

export interface KeyPairPem {
  privateKeyPem: string;
  publicKeyPem: string;
}

/** Generate an asymmetric key pair for the algorithm, exported as PEM. */
export async function generateKeyPairPem(
  alg: string,
  modulusLength = 2048,
): Promise<KeyPairPem> {
  if (!isAsymmetric(alg)) {
    throw new Error(`${alg} does not use a key pair.`);
  }
  const { publicKey, privateKey } = await generateKeyPair(alg, {
    extractable: true,
    modulusLength,
  });
  const [privateKeyPem, publicKeyPem] = await Promise.all([
    exportPKCS8(privateKey),
    exportSPKI(publicKey),
  ]);
  return { privateKeyPem, publicKeyPem };
}

// ---------------------------------------------------------------------------
// Standard claims
// ---------------------------------------------------------------------------

export type StandardClaim = "exp" | "iat" | "nbf" | "aud" | "iss" | "sub" | "jti";
export const STANDARD_CLAIMS: StandardClaim[] = [
  "exp",
  "iat",
  "nbf",
  "aud",
  "iss",
  "sub",
  "jti",
];

export function standardClaimDefault(claim: StandardClaim): unknown {
  const now = Math.floor(Date.now() / 1000);
  switch (claim) {
    case "iat":
    case "nbf":
      return now;
    case "exp":
      return now + 3600;
    case "aud":
      return "https://api.example.com";
    case "iss":
      return "https://issuer.example.com";
    case "sub":
      return "user-1234567890";
    case "jti":
      return (globalThis.crypto as Crypto).randomUUID();
  }
}

/** Insert/overwrite one standard claim without destroying existing content. */
export function addStandardClaim(
  payload: Record<string, unknown>,
  claim: StandardClaim,
): Record<string, unknown> {
  return { ...payload, [claim]: standardClaimDefault(claim) };
}

// ---------------------------------------------------------------------------
// Flexible private-key import (PKCS#8 / PKCS#1 / SEC1 / JWK)
// ---------------------------------------------------------------------------

const EC_CURVE_OID: Record<string, string> = {
  ES256: "1.2.840.10045.3.1.7",
  ES384: "1.3.132.0.34",
  ES512: "1.3.132.0.35",
};

function pemToDerBytes(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN[^-]+-----/g, "")
    .replace(/-----END[^-]+-----/g, "")
    .replace(/\s+/g, "");
  return base64ToBytes(b64).buffer;
}

function derToPem(der: ArrayBuffer, label: string): string {
  const bytes = new Uint8Array(der);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

/** Wrap a PKCS#1 RSAPrivateKey (BEGIN RSA PRIVATE KEY) into PKCS#8. */
function pkcs1ToPkcs8(pkcs1Pem: string): string {
  const inner = pemToDerBytes(pkcs1Pem);
  const pkcs8 = new asn1js.Sequence({
    value: [
      new asn1js.Integer({ value: 0 }),
      new asn1js.Sequence({
        value: [
          new asn1js.ObjectIdentifier({ value: "1.2.840.113549.1.1.1" }), // rsaEncryption
          new asn1js.Null(),
        ],
      }),
      new asn1js.OctetString({ valueHex: inner }),
    ],
  });
  return derToPem(pkcs8.toBER(false), "PRIVATE KEY");
}

/** Wrap a SEC1 ECPrivateKey (BEGIN EC PRIVATE KEY) into PKCS#8 for the alg's curve. */
function sec1ToPkcs8(sec1Pem: string, curveOid: string): string {
  const inner = pemToDerBytes(sec1Pem);
  const pkcs8 = new asn1js.Sequence({
    value: [
      new asn1js.Integer({ value: 0 }),
      new asn1js.Sequence({
        value: [
          new asn1js.ObjectIdentifier({ value: "1.2.840.10045.2.1" }), // id-ecPublicKey
          new asn1js.ObjectIdentifier({ value: curveOid }),
        ],
      }),
      new asn1js.OctetString({ valueHex: inner }),
    ],
  });
  return derToPem(pkcs8.toBER(false), "PRIVATE KEY");
}

/**
 * Import a private key from any common encoding and return an extractable
 * CryptoKey. Accepts PKCS#8, PKCS#1 (RSA), SEC1 (EC) and JWK; rejects
 * encrypted keys with a clear hint.
 */
export async function importPrivateKeyFlexible(
  material: string,
  alg: string,
): Promise<CryptoKey> {
  const info = getAlgInfo(alg);
  if (!info) throw new Error(`Unsupported algorithm: ${alg}`);
  const t = material.trim();
  if (!t) throw new Error("A private key is required for this algorithm.");

  if (t.startsWith("{")) {
    let jwk: JWK;
    try {
      jwk = JSON.parse(t) as JWK;
    } catch {
      throw new Error("Key looks like JWK but is not valid JSON.");
    }
    (jwk as { ext?: boolean }).ext = true;
    return (await importJWK(jwk, alg, { extractable: true })) as CryptoKey;
  }

  if (t.includes("BEGIN ENCRYPTED PRIVATE KEY")) {
    throw new Error(
      "Encrypted private keys aren't supported. Decrypt first: " +
        "openssl pkcs8 -in enc.pem -out key.pem",
    );
  }

  let pkcs8 = t;
  if (t.includes("BEGIN RSA PRIVATE KEY")) {
    if (info.kind !== "RSA" && info.kind !== "PSS")
      throw new Error(`A PKCS#1 RSA private key does not match ${alg}.`);
    pkcs8 = pkcs1ToPkcs8(t);
  } else if (t.includes("BEGIN EC PRIVATE KEY")) {
    if (info.kind !== "EC")
      throw new Error(`An EC (SEC1) private key does not match ${alg}.`);
    pkcs8 = sec1ToPkcs8(t, EC_CURVE_OID[alg]);
  } else if (!t.includes("BEGIN PRIVATE KEY")) {
    throw new Error(
      "Unrecognized key. Use a PEM private key (PKCS#8, PKCS#1 or SEC1) or a JWK.",
    );
  }

  try {
    return await importPKCS8(pkcs8, alg, { extractable: true });
  } catch (e) {
    throw new Error(`This private key does not match ${alg}. ${(e as Error).message}`);
  }
}

function publicPartOfJwk(jwk: JWK): JWK {
  if (jwk.kty === "RSA") return { kty: "RSA", n: jwk.n, e: jwk.e };
  if (jwk.kty === "EC") return { kty: "EC", crv: jwk.crv, x: jwk.x, y: jwk.y };
  if (jwk.kty === "OKP") return { kty: "OKP", crv: jwk.crv, x: jwk.x };
  throw new Error(`Unsupported key type: ${jwk.kty}`);
}

export interface PreparedSigningKey {
  privateKey: CryptoKey;
  /** SPKI PEM of the matching public key, derived from the private key. */
  publicKeyPem: string;
}

/** Import a private key (any format) AND derive its matching public key (SPKI PEM). */
export async function prepareSigningKey(
  material: string,
  alg: string,
): Promise<PreparedSigningKey> {
  const privateKey = await importPrivateKeyFlexible(material, alg);
  const t = material.trim();
  const jwk = t.startsWith("{")
    ? (JSON.parse(t) as JWK)
    : await exportJWK(privateKey);
  const pubKey = (await importJWK(publicPartOfJwk(jwk), alg, {
    extractable: true,
  })) as CryptoKey;
  const publicKeyPem = await exportSPKI(pubKey);
  return { privateKey, publicKeyPem };
}

/** Extract the public key (SPKI PEM) from an X.509 certificate, SPKI PEM, or JWK. */
export async function publicKeyFromCertOrSpki(
  material: string,
  alg: string,
): Promise<string> {
  const t = material.trim();
  if (!t) throw new Error("No certificate or public key provided.");
  let key: CryptoKey;
  if (t.startsWith("{")) {
    key = (await importJWK(JSON.parse(t) as JWK, alg, { extractable: true })) as CryptoKey;
  } else if (t.includes("BEGIN CERTIFICATE")) {
    key = await importX509(t, alg, { extractable: true });
  } else if (t.includes("BEGIN PUBLIC KEY")) {
    key = await importSPKI(t, alg, { extractable: true });
  } else {
    throw new Error("Provide an X.509 certificate, an SPKI public key, or a JWK.");
  }
  return exportSPKI(key);
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

export interface SignParams {
  alg: string;
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  /** HMAC secret string, or PKCS#8 PEM for asymmetric algorithms. */
  key: string;
  /** For HMAC: whether `key` is base64-encoded. */
  secretBase64?: boolean;
}

export async function signJwt(params: SignParams): Promise<string> {
  const { alg, header, payload, key } = params;
  const info = getAlgInfo(alg);
  if (!info) throw new Error(`Unsupported algorithm: ${alg}`);

  let cryptoKey: CryptoKey | Uint8Array;
  if (info.kind === "HMAC") {
    if (!key) throw new Error("A secret is required for HMAC algorithms.");
    cryptoKey = secretToBytes(key, params.secretBase64);
  } else {
    cryptoKey = await importPrivateKeyFlexible(key, alg);
  }

  const protectedHeader = { ...header, alg };
  return new SignJWT(payload).setProtectedHeader(protectedHeader).sign(cryptoKey);
}

// ---------------------------------------------------------------------------
// Decoding (no verification)
// ---------------------------------------------------------------------------

export interface DecodedToken {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  parts: { header: string; payload: string; signature: string };
}

export function normalizeToken(raw: string): string {
  let t = raw.trim();
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, "");
  return t.trim();
}

export function decodeToken(raw: string): DecodedToken {
  const token = normalizeToken(raw);
  if (!token) throw new Error("No token provided.");
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error(
      `A JWT must have 3 parts separated by dots (got ${parts.length}).`,
    );
  }
  const [h, p, s] = parts;

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(bytesToString(base64urlToBytes(h)));
  } catch {
    throw new Error("Header is not valid base64url-encoded JSON.");
  }
  try {
    payload = JSON.parse(bytesToString(base64urlToBytes(p)));
  } catch {
    throw new Error("Payload is not valid base64url-encoded JSON.");
  }
  return { header, payload, parts: { header: h, payload: p, signature: s } };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export interface VerifyParams {
  token: string;
  /** HMAC secret, PEM (SPKI public key or X.509 cert), or JWK JSON. */
  key: string;
  secretBase64?: boolean;
  expectedIssuer?: string;
  expectedAudience?: string;
}

export interface VerifyResult {
  alg: string;
  signatureValid: boolean;
  signatureError?: string;
  timeValid: boolean;
  timeStatus: "valid" | "expired" | "not-yet-valid" | "no-time-claims";
  issuerOk?: boolean;
  audienceOk?: boolean;
  header: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

async function importVerificationKey(
  alg: string,
  key: string,
  secretBase64: boolean | undefined,
): Promise<CryptoKey | Uint8Array> {
  const info = getAlgInfo(alg);
  if (!info) throw new Error(`Unsupported algorithm: ${alg}`);

  if (info.kind === "HMAC") {
    if (!key) throw new Error("A secret is required for HMAC algorithms.");
    return secretToBytes(key, secretBase64);
  }

  const trimmed = key.trim();
  if (!trimmed) throw new Error("A public key is required for this algorithm.");

  if (trimmed.startsWith("{")) {
    let jwk: JWK;
    try {
      jwk = JSON.parse(trimmed) as JWK;
    } catch {
      throw new Error("Key looks like JWK but is not valid JSON.");
    }
    return (await importJWK(jwk, alg)) as CryptoKey;
  }
  if (trimmed.includes("BEGIN CERTIFICATE")) {
    return importX509(trimmed, alg);
  }
  if (trimmed.includes("BEGIN PRIVATE KEY")) {
    throw new Error("Provide the PUBLIC key (SPKI), not a private key.");
  }
  if (trimmed.includes("BEGIN PUBLIC KEY")) {
    return importSPKI(trimmed, alg);
  }
  throw new Error("Unrecognized key format. Expected PEM (SPKI/X.509) or JWK.");
}

/**
 * Verify a token. The verification algorithm is taken from the token header
 * but constrained to the kind implied by the key: we never verify "none", and
 * we reject an alg that does not match the supplied key type. Signature
 * validity and time validity are reported separately.
 */
export async function verifyJwt(params: VerifyParams): Promise<VerifyResult> {
  const { token, key, secretBase64, expectedIssuer, expectedAudience } = params;
  const normalized = normalizeToken(token);

  let header: Record<string, unknown>;
  try {
    header = decodeProtectedHeader(normalized) as Record<string, unknown>;
  } catch {
    throw new Error("Could not read the token header.");
  }
  const alg = String(header.alg ?? "");

  if (alg === "none" || alg === "") {
    return {
      alg: alg || "none",
      signatureValid: false,
      signatureError:
        'Algorithm "none" is not allowed — an unsecured token cannot be trusted.',
      timeValid: false,
      timeStatus: "no-time-claims",
      header,
    };
  }
  if (!getAlgInfo(alg)) {
    return {
      alg,
      signatureValid: false,
      signatureError: `Unsupported or unknown algorithm "${alg}".`,
      timeValid: false,
      timeStatus: "no-time-claims",
      header,
    };
  }

  const result: VerifyResult = {
    alg,
    signatureValid: false,
    timeValid: false,
    timeStatus: "no-time-claims",
    header,
  };

  let verifyKey: CryptoKey | Uint8Array;
  try {
    verifyKey = await importVerificationKey(alg, key, secretBase64);
  } catch (e) {
    result.signatureError = (e as Error).message;
    return result;
  }

  let payload: Record<string, unknown> | undefined;
  try {
    const { payload: bytes } = await compactVerify(normalized, verifyKey, {
      algorithms: [alg], // never trust the header's alg blindly
    });
    result.signatureValid = true;
    try {
      payload = JSON.parse(bytesToString(bytes));
      result.payload = payload;
    } catch {
      payload = undefined;
    }
  } catch (e) {
    result.signatureError = explainVerifyError(e as Error, alg);
    // Still decode payload for time info display.
    try {
      payload = decodeToken(normalized).payload;
      result.payload = payload;
    } catch {
      /* ignore */
    }
  }

  // Time validity (independent of signature).
  if (payload) {
    const now = Math.floor(Date.now() / 1000);
    const exp = typeof payload.exp === "number" ? payload.exp : undefined;
    const nbf = typeof payload.nbf === "number" ? payload.nbf : undefined;
    if (exp !== undefined && now >= exp) {
      result.timeStatus = "expired";
      result.timeValid = false;
    } else if (nbf !== undefined && now < nbf) {
      result.timeStatus = "not-yet-valid";
      result.timeValid = false;
    } else if (exp !== undefined || nbf !== undefined) {
      result.timeStatus = "valid";
      result.timeValid = true;
    } else {
      result.timeStatus = "no-time-claims";
      result.timeValid = true;
    }

    if (expectedIssuer) result.issuerOk = payload.iss === expectedIssuer;
    if (expectedAudience) {
      const aud = payload.aud;
      result.audienceOk = Array.isArray(aud)
        ? aud.includes(expectedAudience)
        : aud === expectedAudience;
    }
  }

  return result;
}

function explainVerifyError(e: Error, alg: string): string {
  const msg = e.message || "";
  if (/signature verification failed/i.test(msg))
    return "Invalid signature — the key does not match the token.";
  if (/alg/i.test(msg) && /not allowed|mismatch/i.test(msg))
    return `The key does not match algorithm ${alg}.`;
  if (/key.*(type|algorithm)/i.test(msg))
    return `Wrong key type for ${alg}.`;
  return `Verification failed: ${msg}`;
}
