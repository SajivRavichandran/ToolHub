"use client";

import { useState } from "react";
import type { ToolComponentProps } from "@/tools/types";
import {
  generateCertificate,
  decodeCsr,
  type KeyType,
  type RsaBits,
  type EcCurve,
  type DecodedCsr,
  type GenerateResult,
} from "./csr";

interface FormState {
  CN: string;
  O: string;
  OU: string;
  L: string;
  ST: string;
  C: string;
  sans: string;
  keyType: KeyType;
  rsaBits: RsaBits;
  ecCurve: EcCurve;
  selfSigned: boolean;
  validityYears: number;
  x509Version: 1 | 3;
}

const initialForm: FormState = {
  CN: "",
  O: "",
  OU: "",
  L: "",
  ST: "",
  C: "",
  sans: "",
  keyType: "RSA",
  rsaBits: 2048,
  ecCurve: "P-256",
  selfSigned: false,
  validityYears: 1,
  x509Version: 3,
};

function parseSans(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const DNS_RE = /^(\*\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_RE = /^[0-9a-fA-F:]+:[0-9a-fA-F:]*$/;

function validSan(value: string): boolean {
  if (DNS_RE.test(value)) return true;
  if (IPV4_RE.test(value)) return value.split(".").every((p) => Number(p) <= 255);
  if (IPV6_RE.test(value)) return true;
  return false;
}

function validate(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.CN.trim()) errors.CN = "Common Name is required.";
  if (form.C && !/^[A-Za-z]{2}$/.test(form.C.trim()))
    errors.C = "Country must be a 2-letter code (e.g. US, GB).";
  const badSans = parseSans(form.sans).filter((s) => !validSan(s));
  if (badSans.length)
    errors.sans = `Invalid SAN(s): ${badSans.join(", ")} (use DNS names or IPs).`;
  return errors;
}

export function CsrGenerator(_props: ToolComponentProps) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [decoded, setDecoded] = useState<DecodedCsr | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onGenerate() {
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    setGenError(null);
    setResult(null);
    setDecoded(null);

    try {
      // Yield so the loading state paints before the (possibly heavy) keygen.
      await new Promise((r) => setTimeout(r, 20));
      const res = await generateCertificate({
        subject: {
          CN: form.CN.trim(),
          O: form.O.trim() || undefined,
          OU: form.OU.trim() || undefined,
          L: form.L.trim() || undefined,
          ST: form.ST.trim() || undefined,
          C: form.C.trim() || undefined,
        },
        sans: parseSans(form.sans),
        keyType: form.keyType,
        rsaBits: form.rsaBits,
        ecCurve: form.ecCurve,
        selfSigned: form.selfSigned,
        validityYears: form.validityYears,
        x509Version: form.x509Version,
      });
      setResult(res);
      setDecoded(await decodeCsr(res.csrPem));
    } catch (e) {
      setGenError((e as Error).message || "Generation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Local-only notice */}
      <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        <span>🔒</span>
        <span>
          <strong>Generated locally.</strong> Your private key never leaves your
          browser — no network requests are made.
        </span>
      </div>

      {/* Subject form */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Common Name (CN)"
          required
          value={form.CN}
          onChange={(v) => set("CN", v)}
          placeholder="example.com"
          error={errors.CN}
        />
        <Field
          label="Organization (O)"
          value={form.O}
          onChange={(v) => set("O", v)}
          placeholder="Example Inc"
        />
        <Field
          label="Department (OU)"
          value={form.OU}
          onChange={(v) => set("OU", v)}
          placeholder="IT"
        />
        <Field
          label="City / Locality (L)"
          value={form.L}
          onChange={(v) => set("L", v)}
          placeholder="San Francisco"
        />
        <Field
          label="State / Province (ST)"
          value={form.ST}
          onChange={(v) => set("ST", v)}
          placeholder="California"
        />
        <Field
          label="Country (C)"
          value={form.C}
          onChange={(v) => set("C", v.toUpperCase())}
          placeholder="US"
          error={errors.C}
          maxLength={2}
        />
        <div className="sm:col-span-2">
          <Field
            label="Subject Alternative Names (SANs)"
            value={form.sans}
            onChange={(v) => set("sans", v)}
            placeholder="example.com, www.example.com, 192.168.1.1"
            error={errors.sans}
            hint="Comma-separated DNS names and/or IP addresses."
          />
        </div>
      </section>

      {/* Key options */}
      <section className="flex flex-col gap-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Key type</span>
            <select
              value={form.keyType}
              onChange={(e) => set("keyType", e.target.value as KeyType)}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            >
              <option value="RSA">RSA</option>
              <option value="ECDSA">ECDSA</option>
            </select>
          </label>

          {form.keyType === "RSA" ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">RSA key size</span>
              <select
                value={form.rsaBits}
                onChange={(e) => set("rsaBits", Number(e.target.value) as RsaBits)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              >
                <option value={2048}>2048</option>
                <option value={3072}>3072</option>
                <option value={4096}>4096 (slower)</option>
              </select>
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">ECDSA curve</span>
              <select
                value={form.ecCurve}
                onChange={(e) => set("ecCurve", e.target.value as EcCurve)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              >
                <option value="P-256">P-256</option>
                <option value="P-384">P-384</option>
              </select>
            </label>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.selfSigned}
            onChange={(e) => set("selfSigned", e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300"
          />
          <span className="font-medium">Also generate a self-signed certificate</span>
        </label>

        {form.selfSigned && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Validity (years)</span>
              <input
                type="number"
                min={1}
                max={30}
                value={form.validityYears}
                onChange={(e) => set("validityYears", Math.max(1, Number(e.target.value)))}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">X.509 version</span>
              <select
                value={form.x509Version}
                onChange={(e) => set("x509Version", Number(e.target.value) as 1 | 3)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              >
                <option value={3}>v3 (recommended)</option>
                <option value={1}>v1</option>
              </select>
            </label>
          </div>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={onGenerate}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Generating…" : "Generate"}
        </button>
        {loading && (
          <span className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            Creating keys & signing (RSA 4096 can take a few seconds)…
          </span>
        )}
      </div>

      {genError && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {genError}
        </div>
      )}

      {/* Output */}
      {result && (
        <section className="flex flex-col gap-4">
          <PemBlock
            title="Private Key (PKCS#8)"
            pem={result.privateKeyPem}
            filename={`${form.CN || "key"}.key`}
            danger
          />
          <PemBlock
            title="Certificate Signing Request (PKCS#10)"
            pem={result.csrPem}
            filename={`${form.CN || "request"}.csr`}
          />
          {result.certPem && (
            <PemBlock
              title="Self-signed Certificate (X.509)"
              pem={result.certPem}
              filename={`${form.CN || "certificate"}.crt`}
            />
          )}
        </section>
      )}

      {/* Verify panel */}
      {decoded && <VerifyPanel decoded={decoded} />}

      {/* OpenSSL cheatsheet */}
      <OpenSslCheatsheet />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  error,
  hint,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  maxLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className={`rounded-lg border bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 dark:bg-neutral-900 ${
          error
            ? "border-red-400 dark:border-red-700"
            : "border-neutral-300 dark:border-neutral-700"
        }`}
      />
      {hint && !error && (
        <span className="text-xs text-neutral-500 dark:text-neutral-400">{hint}</span>
      )}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </label>
  );
}

function PemBlock({
  title,
  pem,
  filename,
  danger,
}: {
  title: string;
  pem: string;
  filename: string;
  danger?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function download() {
    const blob = new Blob([pem], { type: "application/x-pem-file" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">
          {title}
          {danger && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
              keep secret
            </span>
          )}
        </h3>
        <div className="ml-auto flex gap-2">
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(pem);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="rounded-md bg-neutral-200 px-3 py-1 text-xs font-medium text-neutral-800 transition hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={download}
            className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-blue-500"
          >
            Download {filename.split(".").pop()}
          </button>
        </div>
      </div>
      <textarea
        readOnly
        value={pem}
        spellCheck={false}
        className="h-40 w-full resize-y rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs dark:border-neutral-800 dark:bg-neutral-950"
      />
    </div>
  );
}

function VerifyPanel({ decoded }: { decoded: DecodedCsr }) {
  const rows: [string, string][] = [
    ["Subject", decoded.subjectString],
    ["Key type", decoded.keyType],
    ["Key size", decoded.keySize],
    ["Signature algorithm", decoded.signatureAlgorithm],
    ["SANs", decoded.sans.length ? decoded.sans.join(", ") : "—"],
  ];
  return (
    <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold">CSR verification</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            decoded.signatureValid
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          {decoded.signatureValid ? "✓ Signature valid" : "✗ Signature invalid"}
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[180px_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-neutral-500 dark:text-neutral-400">{k}</dt>
            <dd className="break-all font-mono text-xs">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function OpenSslCheatsheet() {
  const items: { label: string; cmd: string }[] = [
    {
      label: "Self-signed certificate (new key)",
      cmd: "openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes",
    },
    {
      label: "CSR from an existing key",
      cmd: "openssl req -new -key key.pem -out request.csr",
    },
    {
      label: "Self-signed with SANs",
      cmd: 'openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes \\\n  -addext "subjectAltName=DNS:example.com,DNS:www.example.com,IP:192.168.1.1"',
    },
    {
      label: "Inspect a certificate",
      cmd: "openssl x509 -in cert.pem -text -noout",
    },
    {
      label: "Verify a CSR",
      cmd: "openssl req -in request.csr -text -noout -verify",
    },
    {
      label: "Convert PFX to PEM",
      cmd: "openssl pkcs12 -in cert.pfx -out cert.pem -nodes",
    },
  ];
  return (
    <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="mb-3 text-sm font-semibold">OpenSSL cheatsheet</h3>
      <div className="flex flex-col gap-3">
        {items.map((it) => (
          <CheatRow key={it.label} label={it.label} cmd={it.cmd} />
        ))}
      </div>
    </section>
  );
}

function CheatRow({ label, cmd }: { label: string; cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
          {label}
        </span>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(cmd);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="ml-auto rounded bg-neutral-200 px-2 py-0.5 text-xs text-neutral-700 transition hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-neutral-200 bg-neutral-50 p-2 font-mono text-xs dark:border-neutral-800 dark:bg-neutral-950">
        {cmd}
      </pre>
    </div>
  );
}
