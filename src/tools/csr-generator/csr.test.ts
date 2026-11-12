import { describe, it, expect } from "vitest";
import { generateCertificate, decodeCsr } from "./csr";

describe("CSR generation", () => {
  it("generates and verifies an RSA 2048 CSR with SANs", async () => {
    const { privateKeyPem, csrPem, certPem } = await generateCertificate({
      subject: { CN: "example.com", O: "Example Inc", OU: "IT", L: "NYC", ST: "NY", C: "US" },
      sans: ["example.com", "www.example.com", "192.168.1.1"],
      keyType: "RSA",
      rsaBits: 2048,
      selfSigned: false,
    });

    expect(privateKeyPem).toContain("-----BEGIN PRIVATE KEY-----");
    expect(csrPem).toContain("-----BEGIN CERTIFICATE REQUEST-----");
    expect(certPem).toBeUndefined();

    const decoded = await decodeCsr(csrPem);
    expect(decoded.signatureValid).toBe(true);
    expect(decoded.keyType).toBe("RSA");
    expect(decoded.keySize).toBe("2048-bit");
    expect(decoded.signatureAlgorithm).toBe("SHA256withRSA");
    expect(decoded.subjectString).toContain("CN=example.com");
    expect(decoded.subjectString).toContain("C=US");
    expect(decoded.sans).toContain("example.com");
    expect(decoded.sans).toContain("www.example.com");
    expect(decoded.sans).toContain("192.168.1.1");
  });

  it("generates and verifies an ECDSA P-256 CSR", async () => {
    const { csrPem } = await generateCertificate({
      subject: { CN: "ecc.example.org", O: "ECC Org", C: "GB" },
      sans: ["ecc.example.org"],
      keyType: "ECDSA",
      ecCurve: "P-256",
    });

    const decoded = await decodeCsr(csrPem);
    expect(decoded.signatureValid).toBe(true);
    expect(decoded.keyType).toBe("ECDSA");
    expect(decoded.keySize).toContain("P-256");
    expect(decoded.signatureAlgorithm).toBe("ecdsa-with-SHA256");
    expect(decoded.subjectString).toContain("CN=ecc.example.org");
    expect(decoded.sans).toEqual(["ecc.example.org"]);
  });

  it("produces a self-signed certificate when requested", async () => {
    const { certPem, csrPem } = await generateCertificate({
      subject: { CN: "selfsigned.local", C: "US" },
      sans: ["selfsigned.local"],
      keyType: "ECDSA",
      ecCurve: "P-384",
      selfSigned: true,
      validityYears: 2,
      x509Version: 3,
    });

    expect(certPem).toContain("-----BEGIN CERTIFICATE-----");
    const decoded = await decodeCsr(csrPem);
    expect(decoded.signatureValid).toBe(true);
    expect(decoded.keySize).toContain("P-384");
    // Per spec, everything is signed with SHA-256.
    expect(decoded.signatureAlgorithm).toBe("ecdsa-with-SHA256");
  });
});
