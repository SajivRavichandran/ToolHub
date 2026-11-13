import { describe, it, expect } from "vitest";
import * as asn1js from "asn1js";
import {
  ALGORITHMS,
  generateSecret,
  generateKeyPairPem,
  signJwt,
  verifyJwt,
  decodeToken,
  isHmac,
  addStandardClaim,
  STANDARD_CLAIMS,
  prepareSigningKey,
  publicKeyFromCertOrSpki,
  importPrivateKeyFlexible,
} from "./jwt";
import { generateCertificate } from "../csr-generator/csr";
import { importPKCS8, exportJWK } from "jose";

/** Downgrade a PKCS#8 PEM to its inner PKCS#1 / SEC1 PEM (for testing import). */
function pkcs8ToInnerPem(pkcs8Pem: string, label: string): string {
  const der = Buffer.from(
    pkcs8Pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""),
    "base64",
  );
  const seq = asn1js.fromBER(
    der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength),
  ).result as asn1js.Sequence;
  const octet = seq.valueBlock.value[2] as asn1js.OctetString;
  const inner = Buffer.from(octet.valueBlock.valueHexView);
  const b64 = inner.toString("base64").match(/.{1,64}/g)!.join("\n");
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----\n`;
}

async function keyMaterial(alg: string) {
  if (isHmac(alg)) {
    const secret = generateSecret(alg);
    return { signKey: secret, verifyKey: secret, wrongVerifyKey: generateSecret(alg) };
  }
  const { privateKeyPem, publicKeyPem } = await generateKeyPairPem(alg, 2048);
  const other = await generateKeyPairPem(alg, 2048);
  return { signKey: privateKeyPem, verifyKey: publicKeyPem, wrongVerifyKey: other.publicKeyPem };
}

describe("JWT sign + verify for all 12 algorithms", () => {
  for (const { alg } of ALGORITHMS) {
    it(`${alg}: signs and verifies`, async () => {
      const { signKey, verifyKey, wrongVerifyKey } = await keyMaterial(alg);
      const token = await signJwt({
        alg,
        header: { alg, typ: "JWT" },
        payload: { sub: "abc", role: "admin" },
        key: signKey,
      });
      expect(token.split(".")).toHaveLength(3);

      const ok = await verifyJwt({ token, key: verifyKey });
      expect(ok.alg).toBe(alg);
      expect(ok.signatureValid).toBe(true);

      const bad = await verifyJwt({ token, key: wrongVerifyKey });
      expect(bad.signatureValid).toBe(false);
      expect(bad.signatureError).toBeTruthy();
    });
  }
});

describe("decoding", () => {
  it("decodes a valid token", async () => {
    const secret = generateSecret("HS256");
    const token = await signJwt({
      alg: "HS256",
      header: { alg: "HS256", typ: "JWT" },
      payload: { sub: "xyz" },
      key: secret,
    });
    const d = decodeToken(token);
    expect(d.header.alg).toBe("HS256");
    expect(d.payload.sub).toBe("xyz");
  });

  it("handles a leading 'Bearer ' prefix", async () => {
    const secret = generateSecret("HS256");
    const token = await signJwt({
      alg: "HS256",
      header: { alg: "HS256", typ: "JWT" },
      payload: { a: 1 },
      key: secret,
    });
    expect(() => decodeToken(`Bearer ${token}`)).not.toThrow();
    const v = await verifyJwt({ token: `Bearer ${token}`, key: secret });
    expect(v.signatureValid).toBe(true);
  });

  it("rejects wrong segment count", () => {
    expect(() => decodeToken("a.b")).toThrow(/3 parts/);
  });

  it("rejects invalid base64url / JSON in header", () => {
    expect(() => decodeToken("!!!.eyJ9.sig")).toThrow();
  });
});

describe("verification safety", () => {
  it('rejects alg "none"', async () => {
    // header {"alg":"none","typ":"JWT"} . payload . (empty sig)
    const header = Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url");
    const payload = Buffer.from('{"sub":"nope"}').toString("base64url");
    const token = `${header}.${payload}.`;
    const v = await verifyJwt({ token, key: "any-secret" });
    expect(v.signatureValid).toBe(false);
    expect(v.signatureError).toMatch(/none/i);
  });

  it("rejects alg/key-type mismatch (RS256 token verified with HMAC secret)", async () => {
    const { privateKeyPem } = await generateKeyPairPem("RS256", 2048);
    const token = await signJwt({
      alg: "RS256",
      header: { alg: "RS256", typ: "JWT" },
      payload: { sub: "x" },
      key: privateKeyPem,
    });
    // Supplying a raw secret for an RSA token must fail (wrong key material).
    const v = await verifyJwt({ token, key: "a-plain-secret" });
    expect(v.signatureValid).toBe(false);
    expect(v.signatureError).toBeTruthy();
  });
});

describe("time validity vs signature", () => {
  it("expired token still reports a valid signature but expired status", async () => {
    const secret = generateSecret("HS256");
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt({
      alg: "HS256",
      header: { alg: "HS256", typ: "JWT" },
      payload: { sub: "x", exp: now - 100 },
      key: secret,
    });
    const v = await verifyJwt({ token, key: secret });
    expect(v.signatureValid).toBe(true);
    expect(v.timeStatus).toBe("expired");
    expect(v.timeValid).toBe(false);
  });

  it("not-yet-valid token reports valid signature but not-yet-valid status", async () => {
    const secret = generateSecret("HS256");
    const now = Math.floor(Date.now() / 1000);
    const token = await signJwt({
      alg: "HS256",
      header: { alg: "HS256", typ: "JWT" },
      payload: { sub: "x", nbf: now + 1000 },
      key: secret,
    });
    const v = await verifyJwt({ token, key: secret });
    expect(v.signatureValid).toBe(true);
    expect(v.timeStatus).toBe("not-yet-valid");
  });
});

describe("flexible private-key import", () => {
  it("imports a PKCS#1 RSA key and signs (RS256)", async () => {
    const { privateKeyPem } = await generateKeyPairPem("RS256", 2048);
    const pkcs1 = pkcs8ToInnerPem(privateKeyPem, "RSA PRIVATE KEY");
    const { publicKeyPem } = await prepareSigningKey(pkcs1, "RS256");
    const token = await signJwt({
      alg: "RS256",
      header: { alg: "RS256", typ: "JWT" },
      payload: { sub: "pkcs1" },
      key: pkcs1,
    });
    const v = await verifyJwt({ token, key: publicKeyPem });
    expect(v.signatureValid).toBe(true);
  });

  it("imports a SEC1 EC key and signs (ES256)", async () => {
    const { privateKeyPem } = await generateKeyPairPem("ES256");
    const sec1 = pkcs8ToInnerPem(privateKeyPem, "EC PRIVATE KEY");
    const { publicKeyPem } = await prepareSigningKey(sec1, "ES256");
    const token = await signJwt({
      alg: "ES256",
      header: { alg: "ES256", typ: "JWT" },
      payload: { sub: "sec1" },
      key: sec1,
    });
    const v = await verifyJwt({ token, key: publicKeyPem });
    expect(v.signatureValid).toBe(true);
  });

  it("imports a JWK private key and signs (ES256)", async () => {
    const { privateKeyPem } = await generateKeyPairPem("ES256");
    const key = await importPKCS8(privateKeyPem, "ES256", { extractable: true });
    const jwk = JSON.stringify(await exportJWK(key));
    const { publicKeyPem } = await prepareSigningKey(jwk, "ES256");
    const token = await signJwt({
      alg: "ES256",
      header: { alg: "ES256", typ: "JWT" },
      payload: { sub: "jwk" },
      key: jwk,
    });
    const v = await verifyJwt({ token, key: publicKeyPem });
    expect(v.signatureValid).toBe(true);
  });

  it("derives the correct public key from the private key", async () => {
    const { privateKeyPem, publicKeyPem } = await generateKeyPairPem("RS256", 2048);
    const prepared = await prepareSigningKey(privateKeyPem, "RS256");
    expect(prepared.publicKeyPem.replace(/\s/g, "")).toBe(
      publicKeyPem.replace(/\s/g, ""),
    );
  });

  it("rejects an encrypted private key with a helpful message", async () => {
    const enc = "-----BEGIN ENCRYPTED PRIVATE KEY-----\nAAAA\n-----END ENCRYPTED PRIVATE KEY-----";
    await expect(importPrivateKeyFlexible(enc, "RS256")).rejects.toThrow(/decrypt/i);
  });

  it("rejects a key whose format does not match the algorithm", async () => {
    const { privateKeyPem } = await generateKeyPairPem("ES256");
    const sec1 = pkcs8ToInnerPem(privateKeyPem, "EC PRIVATE KEY");
    await expect(importPrivateKeyFlexible(sec1, "RS256")).rejects.toThrow();
  });
});

describe("certificate / public-key extraction (C)", () => {
  it("extracts the public key from an X.509 cert and matches the private key", async () => {
    // Build a self-signed cert + key with the CSR tool, then check the JWT tool
    // derives the same public key from the cert and from the private key.
    const { privateKeyPem, certPem } = await generateCertificate({
      subject: { CN: "jwt-signer.example.com" },
      keyType: "RSA",
      rsaBits: 2048,
      selfSigned: true,
      validityYears: 1,
      x509Version: 3,
    });
    expect(certPem).toBeTruthy();
    const fromCert = await publicKeyFromCertOrSpki(certPem!, "RS256");
    const fromPriv = (await prepareSigningKey(privateKeyPem, "RS256")).publicKeyPem;
    expect(fromCert.replace(/\s/g, "")).toBe(fromPriv.replace(/\s/g, ""));
  });
});

describe("standard claims + issuer/audience", () => {
  it("standard-claim helpers produce JSON-serializable values", () => {
    let payload: Record<string, unknown> = {};
    for (const claim of STANDARD_CLAIMS) payload = addStandardClaim(payload, claim);
    expect(() => JSON.parse(JSON.stringify(payload))).not.toThrow();
    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.jti).toBe("string");
    expect(payload.exp as number).toBeGreaterThan(payload.iat as number);
  });

  it("checks expected issuer and audience", async () => {
    const secret = generateSecret("HS256");
    const token = await signJwt({
      alg: "HS256",
      header: { alg: "HS256", typ: "JWT" },
      payload: { iss: "me", aud: ["a", "b"] },
      key: secret,
    });
    const v = await verifyJwt({
      token,
      key: secret,
      expectedIssuer: "me",
      expectedAudience: "b",
    });
    expect(v.issuerOk).toBe(true);
    expect(v.audienceOk).toBe(true);
  });
});
