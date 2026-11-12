"use client";

import { useCallback, useEffect, useState } from "react";
import { tools, getTool } from "@/tools/registry";
import type { Tool } from "@/tools/types";
import { HealthBanner } from "@/components/HealthBanner";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const active = (activeId ? getTool(activeId) : null) ?? null;

  // Number-key shortcuts (1-9) open the matching tool from the home screen.
  const onKey = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const typing =
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable);
    if (typing) return;

    if (e.key === "Escape") {
      setActiveId(null);
      return;
    }
    const n = Number(e.key);
    if (!Number.isNaN(n) && n >= 1 && n <= tools.length && !e.metaKey && !e.ctrlKey && !e.altKey) {
      setActiveId(tools[n - 1].id);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  return (
    <div className="flex min-h-screen flex-col">
      <HealthBanner />

      <div className="flex flex-1">
        {/* Sidebar */}
        <Sidebar
          activeId={activeId}
          onSelect={(id) => {
            setActiveId(id);
            setSidebarOpen(false);
          }}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            active={active}
            onHome={() => setActiveId(null)}
            onMenu={() => setSidebarOpen((v) => !v)}
          />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
            {active ? (
              <ToolPanel tool={active} />
            ) : (
              <HomeGrid onSelect={setActiveId} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function Header({
  active,
  onHome,
  onMenu,
}: {
  active: Tool | null;
  onHome: () => void;
  onMenu: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-neutral-200 bg-neutral-50/80 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80 sm:px-6">
      <button
        onClick={onMenu}
        aria-label="Toggle sidebar"
        className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800 md:hidden"
      >
        ☰
      </button>
      <button
        onClick={onHome}
        className="flex items-center gap-2 text-left transition hover:opacity-80"
      >
        <span className="text-xl">🧰</span>
        <span className="text-lg font-bold tracking-tight">ToolHub</span>
      </button>
      {active && (
        <>
          <span className="text-neutral-400">/</span>
          <span className="truncate text-sm font-medium text-neutral-600 dark:text-neutral-300">
            {active.icon} {active.name}
          </span>
        </>
      )}
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}

function Sidebar({
  activeId,
  onSelect,
  open,
  onClose,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={`fixed z-40 h-full w-64 shrink-0 border-r border-neutral-200 bg-white p-3 transition-transform dark:border-neutral-800 dark:bg-neutral-900 md:static md:z-0 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <p className="px-2 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Tools
        </p>
        <nav className="flex flex-col gap-0.5">
          {tools.map((tool, i) => {
            const isActive = tool.id === activeId;
            return (
              <button
                key={tool.id}
                onClick={() => onSelect(tool.id)}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                }`}
              >
                <span className="text-base">{tool.icon}</span>
                <span className="flex-1 truncate">{tool.name}</span>
                <span
                  className={`text-xs ${
                    isActive ? "text-blue-100" : "text-neutral-400"
                  }`}
                >
                  {i + 1}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

function HomeGrid({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome to ToolHub</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Pick a tool below, or press its number key. AI tools run through your
          local Claude Code CLI; others run entirely in your browser.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool, i) => (
          <button
            key={tool.id}
            onClick={() => onSelect(tool.id)}
            className="group relative flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4 text-left transition hover:border-blue-400 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-blue-600"
          >
            <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-md bg-neutral-100 text-xs font-medium text-neutral-500 group-hover:bg-blue-100 group-hover:text-blue-700 dark:bg-neutral-800 dark:text-neutral-400 dark:group-hover:bg-blue-950 dark:group-hover:text-blue-300">
              {i + 1}
            </span>
            <span className="text-3xl">{tool.icon}</span>
            <span className="font-semibold">{tool.name}</span>
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              {tool.description}
            </span>
            <span
              className={`mt-1 w-fit rounded-full px-2 py-0.5 text-xs font-medium ${
                tool.type === "llm"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              }`}
            >
              {tool.type === "llm" ? "AI · Claude" : "Local"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ToolPanel({ tool }: { tool: Tool }) {
  const Component = tool.component;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className="text-3xl">{tool.icon}</span>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{tool.name}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {tool.description}
          </p>
        </div>
      </div>
      <Component tool={tool} />
    </div>
  );
}
