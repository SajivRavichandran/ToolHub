"use client";

import { useEffect, useMemo, useState } from "react";
import type { ToolComponentProps } from "@/tools/types";
import {
  ALGORITHMS,
  STANDARD_CLAIMS,
  type StandardClaim,
  getAlgInfo,
  isHmac,
  isAsymmetric,
  generateSecret,
  generateKeyPairPem,
  signJwt,
  verifyJwt,
  decodeToken,
  standardClaimDefault,
  type VerifyResult,
  type DecodedToken,
} from "./jwt";
import {
  CopyButton,
  MiniButton,
  TextArea,
  TokenParts,
  Notice,
  unixToDatetimeLocal,
  datetimeLocalToUnix,
  formatUtc,
  relativeTime,
} from "./ui";

const pretty = (o: unknown) => JSON.stringify(o, null, 2);

const DEFAULT_HEADER = pretty({ alg: "HS256", typ: "JWT" });
const DEFAULT_PAYLOAD = pretty({ sub: "1234567890", name: "John Doe" });

type Tab = "create" | "decode";

export function JwtCreator(_props: ToolComponentProps) {
  const [tab, setTab] = useState<Tab>("create");

  // ---- Create state ----
  const [alg, setAlg] = useState("HS256");
  const [headerText, setHeaderText] = useState(DEFAULT_HEADER);
  const [payloadText, setPayloadText] = useState(DEFAULT_PAYLOAD);
  const [secret, setSecret] = useState("");
  const [rsaBits, setRsaBits] = useState(2048);
  const [privPem, setPrivPem] = useState("");
  const [pubPem, setPubPem] = useState("");
  const [genningKeys, setGenningKeys] = useState(false);
  const [signing, setSigning] = useState(false);
  const [token, setToken] = useState("");
  const [signError, setSignError] = useState<string | null>(null);
  const [createVerify, setCreateVerify] = useState<VerifyResult | null>(null);

  // ---- Decode & Verify state ----
  const [tokenInput, setTokenInput] = useState("");
  const [verifyKeyInput, setVerifyKeyInput] = useState("");
  const [secretBase64, setSecretBase64] = useState(false);
  const [expIss, setExpIss] = useState("");
  const [expAud, setExpAud] = useState("");
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  const kind = getAlgInfo(alg)?.kind;

  function onAlgChange(next: string) {
    setAlg(next);
    try {
      const h = JSON.parse(headerText) as Record<string, unknown>;
      h.alg = next;
      if (!h.typ) h.typ = "JWT";
      setHeaderText(pretty(h));
    } catch {
      setHeaderText(pretty({ alg: next, typ: "JWT" }));
    }
    setToken("");
    setCreateVerify(null);
  }

  const headerError = useMemo(() => jsonError(headerText), [headerText]);
  const payloadError = useMemo(() => jsonError(payloadText), [payloadText]);

  function patchPayload(fn: (o: Record<string, unknown>) => void) {
    try {
      const obj = JSON.parse(payloadText || "{}") as Record<string, unknown>;
      fn(obj);
      setPayloadText(pretty(obj));
    } catch {
      /* payloadError is already shown */
    }
  }

  const payloadObj = useMemo<Record<string, unknown>>(() => {
    try {
      return JSON.parse(payloadText || "{}");
    } catch {
      return {};
    }
  }, [payloadText]);

  async function onGenerateKeyPair() {
    setGenningKeys(true);
    setSignError(null);
    try {
      const { privateKeyPem, publicKeyPem } = await generateKeyPairPem(alg, rsaBits);
      setPrivPem(privateKeyPem);
      setPubPem(publicKeyPem);
    } catch (e) {
      setSignError((e as Error).message);
    } finally {
      setGenningKeys(false);
    }
  }

  async function onGenerate() {
    setSignError(null);
    setToken("");
    setCreateVerify(null);
    if (headerError) return setSignError("Header JSON is invalid.");
    if (payloadError) return setSignError("Payload JSON is invalid.");
    const key = isHmac(alg) ? secret : privPem;
    if (!key) {
      return setSignError(
        isHmac(alg)
          ? "Enter or generate a secret first."
          : "Paste or generate a private key first.",
      );
    }
    setSigning(true);
    try {
      await new Promise((r) => setTimeout(r, 10));
      const jwt = await signJwt({
        alg,
        header: JSON.parse(headerText),
        payload: JSON.parse(payloadText),
        key,
      });
      setToken(jwt);
      // Built-in verify of what we just produced.
      const verifyKey = isHmac(alg) ? secret : pubPem;
      if (verifyKey) {
        setCreateVerify(await verifyJwt({ token: jwt, key: verifyKey }));
      }
    } catch (e) {
      setSignError((e as Error).message);
    } finally {
      setSigning(false);
    }
  }

  function openInDecode() {
    setTokenInput(token);
    setVerifyKeyInput(isHmac(alg) ? secret : pubPem);
    setSecretBase64(false);
    setExpIss("");
    setExpAud("");
    setTab("decode");
  }

  // ---- Decode (live) ----
  const decoded = useMemo<{ data?: DecodedToken; error?: string }>(() => {
    if (!tokenInput.trim()) return {};
    try {
      return { data: decodeToken(tokenInput) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [tokenInput]);

  const decodedAlg = decoded.data ? String(decoded.data.header.alg ?? "") : "";

  // ---- Auto verify (debounced) ----
  useEffect(() => {
    if (!tokenInput.trim() || !verifyKeyInput.trim() || !decoded.data) {
      setVerifyResult(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await verifyJwt({
          token: tokenInput,
          key: verifyKeyInput,
          secretBase64,
          expectedIssuer: expIss || undefined,
          expectedAudience: expAud || undefined,
        });
        if (!cancelled) setVerifyResult(r);
      } catch (e) {
        if (!cancelled)
          setVerifyResult({
            alg: decodedAlg,
            signatureValid: false,
            signatureError: (e as Error).message,
            timeValid: false,
            timeStatus: "no-time-claims",
            header: decoded.data!.header,
          });
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenInput, verifyKeyInput, secretBase64, expIss, expAud]);

  return (
    <div className="flex flex-col gap-5">
      <Notice />

      {/* Tabs */}
      <div role="tablist" aria-label="JWT tool tabs" className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {([["create", "Create"], ["decode", "Decode & Verify"]] as [Tab, string][]).map(
          ([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft")
                  setTab((t) => (t === "create" ? "decode" : "create"));
              }}
              className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition ${
                tab === id
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              {label}
            </button>
          ),
        )}
      </div>

      {tab === "create" ? (
        <div className="flex flex-col gap-5">
          {/* Algorithm + key */}
          <section className="flex flex-col gap-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <label className="flex flex-col gap-1 text-sm sm:max-w-xs">
              <span className="font-medium">Algorithm</span>
              <select
                value={alg}
                onChange={(e) => onAlgChange(e.target.value)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              >
                {ALGORITHMS.map((a) => (
                  <option key={a.alg} value={a.alg}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>

            {isHmac(alg) ? (
              <div className="flex flex-col gap-2">
                <TextArea
                  label="Secret"
                  value={secret}
                  onChange={setSecret}
                  rows={2}
                  placeholder="Your HMAC secret…"
                  extraButtons={
                    <MiniButton onClick={() => setSecret(generateSecret(alg))}>
                      Generate Strong Secret
                    </MiniButton>
                  }
                />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  {(getAlgInfo(alg)?.kind === "RSA" || getAlgInfo(alg)?.kind === "PSS") && (
                    <label className="flex items-center gap-2 text-sm">
                      <span className="font-medium">RSA size</span>
                      <select
                        value={rsaBits}
                        onChange={(e) => setRsaBits(Number(e.target.value))}
                        className="rounded-lg border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                      >
                        <option value={2048}>2048</option>
                        <option value={3072}>3072</option>
                        <option value={4096}>4096</option>
                      </select>
                    </label>
                  )}
                  <MiniButton onClick={onGenerateKeyPair}>
                    {genningKeys ? "Generating…" : "Generate Key Pair"}
                  </MiniButton>
                  {genningKeys && (
                    <span className="flex items-center gap-2 text-xs text-neutral-500">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                      Generating RSA keys can take a few seconds…
                    </span>
                  )}
                </div>
                <TextArea
                  label="Private Key (PKCS#8 PEM)"
                  value={privPem}
                  onChange={setPrivPem}
                  rows={5}
                  placeholder="-----BEGIN PRIVATE KEY-----"
                />
                {pubPem && (
                  <TextArea
                    label="Public Key (SPKI PEM) — share to let others verify"
                    value={pubPem}
                    readOnly
                    rows={4}
                  />
                )}
              </div>
            )}
          </section>

          {/* Header + payload */}
          <TextArea label="Header" value={headerText} onChange={setHeaderText} error={headerError} rows={4} />
          <TextArea label="Payload" value={payloadText} onChange={setPayloadText} error={payloadError} rows={7} />

          {/* Standard claims */}
          <section className="flex flex-col gap-2">
            <span className="text-sm font-medium">Add standard claims</span>
            <div className="flex flex-wrap gap-2">
              {STANDARD_CLAIMS.map((c) => (
                <MiniButton key={c} onClick={() => patchPayload((o) => { o[c] = standardClaimDefault(c); })}>
                  + {c}
                </MiniButton>
              ))}
            </div>
          </section>

          {/* Time claims */}
          <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <span className="text-sm font-medium">Time claims (UTC → UNIX seconds)</span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(["iat", "nbf", "exp"] as const).map((claim) => (
                <label key={claim} className="flex flex-col gap-1 text-sm">
                  <span className="font-medium uppercase">{claim}</span>
                  <input
                    type="datetime-local"
                    value={
                      typeof payloadObj[claim] === "number"
                        ? unixToDatetimeLocal(payloadObj[claim] as number)
                        : ""
                    }
                    onChange={(e) => {
                      const sec = datetimeLocalToUnix(e.target.value);
                      patchPayload((o) => {
                        if (sec === undefined) delete o[claim];
                        else o[claim] = sec;
                      });
                    }}
                    className="rounded-lg border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                  />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-500">exp presets:</span>
              {([["+15 min", 900], ["+1 hour", 3600], ["+1 day", 86400], ["+30 days", 2592000]] as [string, number][]).map(
                ([label, delta]) => (
                  <MiniButton
                    key={label}
                    onClick={() =>
                      patchPayload((o) => {
                        o.exp = Math.floor(Date.now() / 1000) + delta;
                      })
                    }
                  >
                    {label}
                  </MiniButton>
                ),
              )}
            </div>
          </section>

          <div className="flex items-center gap-3">
            <button
              onClick={onGenerate}
              disabled={signing}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-60"
            >
              {signing ? "Signing…" : "Generate JWT Token"}
            </button>
          </div>

          {signError && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {signError}
            </div>
          )}

          {token && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Token</h3>
                <div className="ml-auto flex gap-2">
                  <CopyButton text={token} />
                  <MiniButton onClick={openInDecode}>Open in Decode &amp; Verify →</MiniButton>
                </div>
              </div>
              <TokenParts token={token} />
              <TokenSummary token={token} verify={createVerify} asymNoPub={isAsymmetric(alg) && !pubPem} />
            </section>
          )}
        </div>
      ) : (
        <DecodeVerify
          tokenInput={tokenInput}
          setTokenInput={setTokenInput}
          decoded={decoded}
          decodedAlg={decodedAlg}
          verifyKeyInput={verifyKeyInput}
          setVerifyKeyInput={setVerifyKeyInput}
          secretBase64={secretBase64}
          setSecretBase64={setSecretBase64}
          expIss={expIss}
          setExpIss={setExpIss}
          expAud={expAud}
          setExpAud={setExpAud}
          verifyResult={verifyResult}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function TokenSummary({
  token,
  verify,
  asymNoPub,
}: {
  token: string;
  verify: VerifyResult | null;
  asymNoPub: boolean;
}) {
  let header: Record<string, unknown> = {};
  let payload: Record<string, unknown> = {};
  try {
    const d = decodeToken(token);
    header = d.header;
    payload = d.payload;
  } catch {
    /* ignore */
  }
  const exp = typeof payload.exp === "number" ? payload.exp : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <JsonView title="Header" value={header} />
        <JsonView title="Payload" value={payload} />
      </div>
      {exp !== undefined && (
        <div className="text-sm">
          <span className="text-neutral-500">Expiry: </span>
          <ExpiryBadge exp={exp} />
        </div>
      )}
      {verify ? (
        <ResultBanner verify={verify} />
      ) : asymNoPub ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Generate a key pair (not just paste a private key) to auto-verify and share the public key.
        </div>
      ) : null}
    </div>
  );
}

function ExpiryBadge({ exp }: { exp: number }) {
  const now = Math.floor(Date.now() / 1000);
  const expired = now >= exp;
  return (
    <span className={expired ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>
      {expired ? `Expired ${relativeTime(exp)}` : `Expires ${relativeTime(exp)}`} ({formatUtc(exp)})
    </span>
  );
}

function JsonView({ title, value }: { title: string; value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">{title}</span>
        <div className="ml-auto">
          <CopyButton text={text} />
        </div>
      </div>
      <pre className="max-h-48 overflow-auto rounded-lg border border-neutral-200 bg-neutral-50 p-2 font-mono text-xs dark:border-neutral-800 dark:bg-neutral-950">
        {text}
      </pre>
    </div>
  );
}

function ResultBanner({ verify }: { verify: VerifyResult }) {
  const sigOk = verify.signatureValid;
  return (
    <div className="flex flex-col gap-2">
      <div
        className={`rounded-lg border p-3 text-sm ${
          sigOk
            ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
            : "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        }`}
      >
        <strong>{sigOk ? "✓ Signature valid" : "✗ Signature invalid"}</strong>
        {" — "}
        {sigOk ? `verified with ${verify.alg}` : verify.signatureError}
      </div>
      {sigOk && verify.timeStatus !== "no-time-claims" && (
        <div
          className={`rounded-lg border p-2 text-xs ${
            verify.timeValid
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
              : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
          }`}
        >
          Time validity:{" "}
          {verify.timeStatus === "valid"
            ? "within validity window"
            : verify.timeStatus === "expired"
              ? "expired"
              : "not yet valid"}
        </div>
      )}
      {verify.issuerOk !== undefined && (
        <div className="text-xs text-neutral-500">
          Issuer: {verify.issuerOk ? "✓ matches" : "✗ does not match"}
        </div>
      )}
      {verify.audienceOk !== undefined && (
        <div className="text-xs text-neutral-500">
          Audience: {verify.audienceOk ? "✓ matches" : "✗ does not match"}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function DecodeVerify(props: {
  tokenInput: string;
  setTokenInput: (v: string) => void;
  decoded: { data?: DecodedToken; error?: string };
  decodedAlg: string;
  verifyKeyInput: string;
  setVerifyKeyInput: (v: string) => void;
  secretBase64: boolean;
  setSecretBase64: (v: boolean) => void;
  expIss: string;
  setExpIss: (v: string) => void;
  expAud: string;
  setExpAud: (v: string) => void;
  verifyResult: VerifyResult | null;
}) {
  const { decoded, decodedAlg } = props;
  const algInfo = getAlgInfo(decodedAlg);
  const hmac = isHmac(decodedAlg);
  const keyPlaceholder = hmac
    ? "Your HMAC secret…"
    : "-----BEGIN PUBLIC KEY----- (SPKI), an X.509 certificate, or a JWK";

  return (
    <div className="flex flex-col gap-5">
      <TextArea
        label="JWT token"
        value={props.tokenInput}
        onChange={props.setTokenInput}
        rows={4}
        placeholder="Paste a JWT here (a leading 'Bearer ' is handled automatically)…"
      />

      {decoded.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {decoded.error}
        </div>
      )}

      {decoded.data && (
        <>
          <TokenParts token={props.tokenInput} />
          {decodedAlg === "none" && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              ⚠️ This token uses <code>alg: &quot;none&quot;</code> — it is unsigned and must never be trusted.
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <JsonView title="Header" value={decoded.data.header} />
            <JsonView title="Payload" value={decoded.data.payload} />
          </div>
          <ClaimsHelper payload={decoded.data.payload} />

          {/* Verify */}
          <section className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="text-sm">
              <span className="font-medium">Detected algorithm: </span>
              <code>{decodedAlg || "—"}</code>
              {algInfo && (
                <span className="text-neutral-500">
                  {" "}
                  · expects {hmac ? "an HMAC secret" : "a public key (SPKI / X.509 / JWK)"}
                </span>
              )}
            </div>
            <TextArea
              label="Verification key"
              value={props.verifyKeyInput}
              onChange={props.setVerifyKeyInput}
              rows={hmac ? 2 : 5}
              placeholder={keyPlaceholder}
            />
            {hmac && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={props.secretBase64}
                  onChange={(e) => props.setSecretBase64(e.target.checked)}
                  className="h-4 w-4"
                />
                Secret is base64 encoded
              </label>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Expected issuer (optional)</span>
                <input
                  value={props.expIss}
                  onChange={(e) => props.setExpIss(e.target.value)}
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Expected audience (optional)</span>
                <input
                  value={props.expAud}
                  onChange={(e) => props.setExpAud(e.target.value)}
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
                />
              </label>
            </div>
            <p className="text-xs text-neutral-500">
              For safety, verification only uses the algorithm that matches your key
              type, and <code>alg: &quot;none&quot;</code> is always rejected — the
              token&apos;s own header is never trusted to choose the algorithm.
            </p>
            {props.verifyResult ? (
              <ResultBanner verify={props.verifyResult} />
            ) : (
              <p className="text-xs text-neutral-400">
                Enter a key to verify (runs automatically).
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ClaimsHelper({ payload }: { payload: Record<string, unknown> }) {
  const rows = (["iat", "nbf", "exp"] as const)
    .filter((c) => typeof payload[c] === "number")
    .map((c) => [c, payload[c] as number] as const);
  if (!rows.length) return null;
  const now = Math.floor(Date.now() / 1000);
  const exp = typeof payload.exp === "number" ? payload.exp : undefined;
  const nbf = typeof payload.nbf === "number" ? payload.nbf : undefined;
  let status: { label: string; cls: string } = {
    label: "valid",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  };
  if (exp !== undefined && now >= exp)
    status = { label: "expired", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" };
  else if (nbf !== undefined && now < nbf)
    status = { label: "not yet valid", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" };

  return (
    <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold">Time claims</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}>{status.label}</span>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[80px_1fr]">
        {rows.map(([c, sec]) => (
          <div key={c} className="contents">
            <dt className="uppercase text-neutral-500">{c}</dt>
            <dd className="font-mono text-xs">
              {formatUtc(sec)} ({relativeTime(sec)})
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function jsonError(text: string): string | null {
  if (!text.trim()) return null;
  try {
    const v = JSON.parse(text);
    if (typeof v !== "object" || v === null || Array.isArray(v))
      return "Must be a JSON object.";
    return null;
  } catch (e) {
    return `Invalid JSON: ${(e as Error).message}`;
  }
}
