"use client";

import { useCallback, useId, useRef, useState } from "react";
import {
  ACCEPT_ATTR,
  extractTextFromFile,
  isSupportedFile,
} from "@/lib/extract-text";

interface FileDropProps {
  /** Called with the extracted plain text for each accepted file. */
  onText: (text: string, fileName: string) => void;
  disabled?: boolean;
}

interface FileState {
  name: string;
  status: "reading" | "done" | "error";
  message?: string;
  chars?: number;
}

/**
 * Drag-and-drop + click-to-browse zone that extracts plain text from dropped
 * files (txt/md/pdf/docx) entirely in the browser and hands the text to the
 * parent. Nothing is uploaded; the extracted text is treated like pasted input.
 */
export function FileDrop({ onText, disabled }: FileDropProps) {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<FileState[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const handleFiles = useCallback(
    async (list: FileList | File[]) => {
      const arr = Array.from(list);
      if (arr.length === 0) return;

      for (const file of arr) {
        if (!isSupportedFile(file.name)) {
          setFiles((prev) => [
            ...prev,
            {
              name: file.name,
              status: "error",
              message: "Unsupported file type",
            },
          ]);
          continue;
        }
        setFiles((prev) => [...prev, { name: file.name, status: "reading" }]);
        try {
          const { text, warnings } = await extractTextFromFile(file);
          onText(text, file.name);
          setFiles((prev) =>
            prev.map((f) =>
              f.name === file.name && f.status === "reading"
                ? {
                    name: file.name,
                    status: "done",
                    chars: text.length,
                    message: warnings[0],
                  }
                : f,
            ),
          );
        } catch (e) {
          setFiles((prev) =>
            prev.map((f) =>
              f.name === file.name && f.status === "reading"
                ? {
                    name: file.name,
                    status: "error",
                    message: (e as Error).message,
                  }
                : f,
            ),
          );
        }
      }
    },
    [onText],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (disabled) return;
      if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
    },
    [disabled, handleFiles],
  );

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs transition ${
          dragging
            ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
            : "border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-900"
        } ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span>
          <span className="font-medium">Drop a file</span> or click to browse —
          PDF, DOCX, TXT, MD
        </span>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          disabled={disabled}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {files.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 rounded-md bg-neutral-50 px-2 py-1 dark:bg-neutral-900"
            >
              <StatusDot status={f.status} />
              <span className="truncate font-medium text-neutral-700 dark:text-neutral-200">
                {f.name}
              </span>
              <span className="ml-auto whitespace-nowrap text-neutral-500 dark:text-neutral-400">
                {f.status === "reading" && "reading…"}
                {f.status === "done" &&
                  `+${(f.chars ?? 0).toLocaleString()} chars`}
                {f.status === "error" && (
                  <span className="text-red-600 dark:text-red-400">
                    {f.message}
                  </span>
                )}
              </span>
              {f.status === "done" && f.message && (
                <span
                  title={f.message}
                  className="text-amber-600 dark:text-amber-400"
                >
                  ⚠
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: FileState["status"] }) {
  const cls =
    status === "reading"
      ? "animate-pulse bg-blue-500"
      : status === "done"
        ? "bg-green-500"
        : "bg-red-500";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${cls}`} />;
}
