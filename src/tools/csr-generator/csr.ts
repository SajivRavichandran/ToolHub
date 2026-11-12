/**
 * Framework-free CSR / self-signed certificate generation and decoding.
 *
 * Runs entirely with the Web Crypto API (available as `globalThis.crypto` in
 * both modern browsers and Node 20+), plus pkijs/asn1js for ASN.1 encoding.
 * No network calls, no secrets logged. Importable from the React component and
 * from Vitest (Node) alike.
 */
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KeyType = "RSA" | "ECDSA";
export type RsaBits = 2048 | 3072 | 4096;
export type EcCurve = "P-256" | "P-384";

export interface SubjectInput {
  CN: string;
  O?: string;
  OU?: string;
  L?: string;
  ST?: string;
  C?: string;
}

export interface GenerateParams {
  subject: SubjectInput;
  /** DNS names / IPs for the subjectAltName extension request. */
  sans?: string[];
  keyType: KeyType;
  rsaBits?: RsaBits;
  ecCurve?: EcCurve;
  selfSigned?: boolean;
  validityYears?: number;
  /** X.509 version for the self-signed cert (1 or 3). Default 3. */
  x509Version?: 1 | 3;
}

export interface GenerateResult {
  privateKeyPem: string;
  csrPem: string;
  certPem?: string;
}

export interface DecodedCsr {
  subject: { oid: string; name: string; value: string }[];
  subjectString: string;
  keyType: string;
  keySize: string;
  signatureAlgorithm: string;
  sans: string[];
  signatureValid: boolean;
}

// ---------------------------------------------------------------------------
// OIDs
// ---------------------------------------------------------------------------

const OID = {
  CN: "2.5.4.3",
  O: "2.5.4.10",
  OU: "2.5.4.11",
  L: "2.5.4.7",
  ST: "2.5.4.8",
  C: "2.5.4.6",
  extensionRequest: "1.2.840.113549.1.9.14",
  subjectAltName: "2.5.29.17",
  basicConstraints: "2.5.29.19",
  keyUsage: "2.5.29.15",
} as const;

const OID_TO_NAME: Record<string, string> = {
  "2.5.4.3": "CN",
  "2.5.4.10": "O",
  "2.5.4.11": "OU",
  "2.5.4.7": "L",
  "2.5.4.8": "ST",
  "2.5.4.6": "C",
};

const SIG_OID_TO_NAME: Record<string, string> = {
  "1.2.840.113549.1.1.11": "SHA256withRSA",
  "1.2.840.113549.1.1.12": "SHA384withRSA",
  "1.2.840.113549.1.1.13": "SHA512withRSA",
  "1.2.840.10045.4.3.2": "ecdsa-with-SHA256",
  "1.2.840.10045.4.3.3": "ecdsa-with-SHA384",
};

const CURVE_OID_TO_NAME: Record<string, { name: string; size: string }> = {
  "1.2.840.10045.3.1.7": { name: "ECDSA", size: "P-256 (256-bit)" },
  "1.3.132.0.34": { name: "ECDSA", size: "P-384 (384-bit)" },
  "1.3.132.0.35": { name: "ECDSA", size: "P-521 (521-bit)" },
};

// ---------------------------------------------------------------------------
// Web Crypto + pkijs engine
// ---------------------------------------------------------------------------

function getWebCrypto(): Crypto {
  const wc = (globalThis as { crypto?: Crypto }).crypto;
  if (!wc || !wc.subtle) {
    throw new Error("Web Crypto API is not available in this environment.");
  }
  return wc;
}

let engineReady = false;
function ensureEngine(): pkijs.ICryptoEngine {
  if (!engineReady) {
    const wc = getWebCrypto();
    pkijs.setEngine(
      "toolhub",
      new pkijs.CryptoEngine({ name: "toolhub", crypto: wc }),
    );
    engineReady = true;
  }
  return pkijs.getCrypto(true);
}

// ---------------------------------------------------------------------------
// PEM helpers
// ---------------------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // btoa is available in modern browsers and Node 16+.
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toPem(der: ArrayBuffer, label: string): string {
  const b64 = bytesToBase64(new Uint8Array(der));
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  return base64ToBytes(b64).buffer;
}

// ---------------------------------------------------------------------------
// SAN helpers
// ---------------------------------------------------------------------------

function isIPv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

function isIPv6(value: string): boolean {
  return value.includes(":") && /^[0-9a-fA-F:]+$/.test(value);
}

function ipv4ToBytes(value: string): Uint8Array {
  return Uint8Array.from(value.split(".").map((p) => Number(p)));
}

function ipv6ToBytes(value: string): Uint8Array {
  const halves = value.split("::");
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length > 1 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - (head.length + tail.length);
  const groups =
    halves.length > 1
      ? [...head, ...Array(Math.max(missing, 0)).fill("0"), ...tail]
      : value.split(":");
  const bytes = new Uint8Array(16);
  groups.slice(0, 8).forEach((g, i) => {
    const n = parseInt(g || "0", 16);
    bytes[i * 2] = (n >> 8) & 0xff;
    bytes[i * 2 + 1] = n & 0xff;
  });
  return bytes;
}

function sanToGeneralName(value: string): pkijs.GeneralName {
  const v = value.trim();
  if (isIPv4(v)) {
    return new pkijs.GeneralName({
      type: 7,
      value: new asn1js.OctetString({ valueHex: ipv4ToBytes(v).buffer }),
    });
  }
  if (isIPv6(v)) {
    return new pkijs.GeneralName({
      type: 7,
      value: new asn1js.OctetString({ valueHex: ipv6ToBytes(v).buffer }),
    });
  }
  // dNSName
  return new pkijs.GeneralName({ type: 2, value: v });
}

// ---------------------------------------------------------------------------
// Subject building
// ---------------------------------------------------------------------------

/**
 * Build the subject/issuer Name as a proper RDNSequence where each attribute
 * gets its OWN RelativeDistinguishedName (its own SET). Assigning pkijs's flat
 * `typesAndValues` instead packs everything into a single multi-valued RDN,
 * which most CAs reject — so we construct the schema explicitly.
 */
function buildName(subject: SubjectInput): pkijs.RelativeDistinguishedNames {
  const entries: [string, string, boolean][] = [];
  const add = (oid: string, value: string, printable = false) => {
    if (value) entries.push([oid, value, printable]);
  };
  add(OID.CN, subject.CN);
  add(OID.OU, subject.OU ?? "");
  add(OID.O, subject.O ?? "");
  add(OID.L, subject.L ?? "");
  add(OID.ST, subject.ST ?? "");
  add(OID.C, (subject.C ?? "").toUpperCase(), true);

  // RDNSequence ::= SEQUENCE OF RelativeDistinguishedName
  // RelativeDistinguishedName ::= SET OF AttributeTypeAndValue  (one each)
  const rdnSequence = new asn1js.Sequence({
    value: entries.map(
      ([oid, value, printable]) =>
        new asn1js.Set({
          value: [
            new asn1js.Sequence({
              value: [
                new asn1js.ObjectIdentifier({ value: oid }),
                printable
                  ? new asn1js.PrintableString({ value })
                  : new asn1js.Utf8String({ value }),
              ],
            }),
          ],
        }),
    ),
  });

  // Round-trip through BER so pkijs records `valueBeforeDecode` and re-emits
  // this exact structure (separate RDNs) instead of collapsing to one SET.
  const parsed = asn1js.fromBER(rdnSequence.toBER(false));
  return new pkijs.RelativeDistinguishedNames({ schema: parsed.result });
}

function sanExtension(sans: string[]): pkijs.Extension {
  const altNames = new pkijs.GeneralNames({
    names: sans.map(sanToGeneralName),
  });
  return new pkijs.Extension({
    extnID: OID.subjectAltName,
    critical: false,
    extnValue: altNames.toSchema().toBER(false),
    parsedValue: altNames,
  });
}

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

function keyGenParams(params: GenerateParams): {
  generate: RsaHashedKeyGenParams | EcKeyGenParams;
  sign: AlgorithmIdentifier | RsaPssParams | EcdsaParams;
} {
  if (params.keyType === "RSA") {
    const modulusLength = params.rsaBits ?? 2048;
    return {
      generate: {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: "SHA-256",
      },
      sign: { name: "RSASSA-PKCS1-v1_5" },
    };
  }
  const namedCurve = params.ecCurve ?? "P-256";
  return {
    generate: { name: "ECDSA", namedCurve },
    sign: { name: "ECDSA", hash: "SHA-256" } as EcdsaParams,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateCertificate(
  params: GenerateParams,
): Promise<GenerateResult> {
  const engine = ensureEngine();
  const wc = getWebCrypto();
  const { generate } = keyGenParams(params);

  const keyPair = (await wc.subtle.generateKey(generate, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;

  // --- Private key: PKCS#8 PEM ---
  const pkcs8 = await wc.subtle.exportKey("pkcs8", keyPair.privateKey);
  const privateKeyPem = toPem(pkcs8, "PRIVATE KEY");

  const sans = (params.sans ?? []).map((s) => s.trim()).filter(Boolean);

  // --- PKCS#10 CSR ---
  const pkcs10 = new pkijs.CertificationRequest();
  pkcs10.version = 0;
  pkcs10.subject = buildName(params.subject);
  await pkcs10.subjectPublicKeyInfo.importKey(keyPair.publicKey, engine);

  if (sans.length > 0) {
    const extensions = new pkijs.Extensions({
      extensions: [sanExtension(sans)],
    });
    pkcs10.attributes = [
      new pkijs.Attribute({
        type: OID.extensionRequest,
        values: [extensions.toSchema()],
      }),
    ];
  }

  await pkcs10.sign(keyPair.privateKey, "SHA-256");
  const csrDer = pkcs10.toSchema().toBER(false);
  const csrPem = toPem(csrDer, "CERTIFICATE REQUEST");

  const result: GenerateResult = { privateKeyPem, csrPem };

  // --- Optional self-signed X.509 certificate ---
  if (params.selfSigned) {
    const version = params.x509Version ?? 3;
    const years = params.validityYears ?? 1;

    const cert = new pkijs.Certificate();
    cert.version = version - 1; // v3 -> 2
    const serial = wc.getRandomValues(new Uint8Array(16));
    serial[0] &= 0x7f; // ensure positive
    cert.serialNumber = new asn1js.Integer({ valueHex: serial.buffer });
    cert.issuer = buildName(params.subject);
    cert.subject = buildName(params.subject);

    const now = new Date();
    const end = new Date(now);
    end.setFullYear(end.getFullYear() + years);
    cert.notBefore.value = now;
    cert.notAfter.value = end;

    await cert.subjectPublicKeyInfo.importKey(keyPair.publicKey, engine);

    if (version === 3) {
      const exts: pkijs.Extension[] = [];
      // basicConstraints: CA:FALSE
      const bc = new pkijs.BasicConstraints({ cA: false });
      exts.push(
        new pkijs.Extension({
          extnID: OID.basicConstraints,
          critical: true,
          extnValue: bc.toSchema().toBER(false),
          parsedValue: bc,
        }),
      );
      if (sans.length > 0) exts.push(sanExtension(sans));
      cert.extensions = exts;
    }

    await cert.sign(keyPair.privateKey, "SHA-256");
    const certDer = cert.toSchema().toBER(false);
    result.certPem = toPem(certDer, "CERTIFICATE");
  }

  return result;
}

export async function decodeCsr(pem: string): Promise<DecodedCsr> {
  ensureEngine();
  const der = pemToDer(pem);
  const asn1 = asn1js.fromBER(der);
  if (asn1.offset === -1) throw new Error("Could not parse CSR (invalid DER).");

  const pkcs10 = new pkijs.CertificationRequest({ schema: asn1.result });

  // Subject
  const subject = pkcs10.subject.typesAndValues.map((tv) => {
    const oid = tv.type;
    return {
      oid,
      name: OID_TO_NAME[oid] ?? oid,
      value: String(tv.value.valueBlock.value),
    };
  });
  const subjectString = subject.map((s) => `${s.name}=${s.value}`).join(", ");

  // Key type / size
  const spkiAlg = pkcs10.subjectPublicKeyInfo.algorithm.algorithmId;
  let keyType = spkiAlg;
  let keySize = "";
  if (spkiAlg === "1.2.840.113549.1.1.1") {
    keyType = "RSA";
    const spk = pkcs10.subjectPublicKeyInfo.subjectPublicKey.valueBlock
      .valueHexView as Uint8Array;
    const parsed = asn1js.fromBER(spk.buffer.slice(spk.byteOffset, spk.byteOffset + spk.byteLength));
    const seq = parsed.result as asn1js.Sequence;
    const modulus = (seq.valueBlock.value[0] as asn1js.Integer).valueBlock
      .valueHexView as Uint8Array;
    // Strip a leading 0x00 sign byte if present.
    const len = modulus[0] === 0 ? modulus.length - 1 : modulus.length;
    keySize = `${len * 8}-bit`;
  } else if (spkiAlg === "1.2.840.10045.2.1") {
    const params = pkcs10.subjectPublicKeyInfo.algorithm.algorithmParams;
    const curveOid = params ? String(params.valueBlock.toString()) : "";
    const curve = CURVE_OID_TO_NAME[curveOid];
    keyType = "ECDSA";
    keySize = curve ? curve.size : curveOid;
  }

  // Signature algorithm
  const sigOid = pkcs10.signatureAlgorithm.algorithmId;
  const signatureAlgorithm = SIG_OID_TO_NAME[sigOid] ?? sigOid;

  // SANs from the extensionRequest attribute
  const sans: string[] = [];
  const attr = (pkcs10.attributes ?? []).find(
    (a) => a.type === OID.extensionRequest,
  );
  if (attr) {
    const exts = new pkijs.Extensions({ schema: attr.values[0] });
    const sanExt = exts.extensions.find((e) => e.extnID === OID.subjectAltName);
    if (sanExt) {
      const inner = asn1js.fromBER(sanExt.extnValue.valueBlock.valueHexView);
      const names = new pkijs.GeneralNames({ schema: inner.result });
      for (const n of names.names) {
        if (n.type === 2) {
          sans.push(String(n.value));
        } else if (n.type === 7) {
          const bytes = new Uint8Array(
            (n.value as asn1js.OctetString).valueBlock.valueHexView,
          );
          sans.push(formatIpBytes(bytes));
        }
      }
    }
  }

  const signatureValid = await pkcs10.verify();

  return {
    subject,
    subjectString,
    keyType,
    keySize,
    signatureAlgorithm,
    sans,
    signatureValid,
  };
}

function formatIpBytes(bytes: Uint8Array): string {
  if (bytes.length === 4) return Array.from(bytes).join(".");
  if (bytes.length === 16) {
    const groups: string[] = [];
    for (let i = 0; i < 16; i += 2) {
      groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
    }
    return groups.join(":");
  }
  return Array.from(bytes).join(".");
}
