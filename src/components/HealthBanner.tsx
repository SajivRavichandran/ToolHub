"use client";

import { useEffect, useState } from "react";

type Health =
  | { state: "checking" }
  | { state: "ok"; version: string }
  | { state: "error"; message: string };

export function HealthBanner() {
  const [health, setHealth] = useState<Health>({ state: "checking" });
  const [dismissed, setDismissed] = useState(false);

  async function check() {
    setHealth({ state: "checking" });
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const data = await res.json();
      if (data.ok) setHealth({ state: "ok", version: data.version });
      else setHealth({ state: "error", message: data.error });
    } catch (e) {
      setHealth({ state: "error", message: (e as Error).message });
    }
  }

  useEffect(() => {
    check();
  }, []);

  if (health.state === "ok" || health.state === "checking" || dismissed) {
    return null;
  }

  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <div className="mx-auto flex max-w-5xl items-start gap-3">
        <span className="text-lg leading-none">⚠️</span>
        <div className="flex-1">
          <p className="font-semibold">Claude CLI is not responding.</p>
          <p className="mt-0.5 opacity-90">{health.message}</p>
          <ul className="mt-2 list-inside list-disc space-y-0.5 opacity-90">
            <li>
              Make sure Claude Code is installed:{" "}
              <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">
                claude --version
              </code>
            </li>
            <li>
              Sign in if your session expired:{" "}
              <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">
                claude
              </code>{" "}
              then <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">/login</code>
            </li>
            <li>AI-powered tools will not work until this is resolved. Local tools still work.</li>
          </ul>
          <button
            onClick={check}
            className="mt-2 rounded-md bg-amber-200 px-3 py-1 font-medium text-amber-900 transition hover:bg-amber-300 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
          >
            Retry
          </button>
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="rounded px-2 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
