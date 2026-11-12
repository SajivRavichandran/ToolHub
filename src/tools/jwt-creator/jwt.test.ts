import { describe, it, expect } from "vitest";
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
} from "./jwt";

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
