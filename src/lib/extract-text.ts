"use client";

/**
 * Client-side text extraction for dropped / uploaded files.
 *
 * Everything runs in the browser — files are never uploaded to the server. The
 * extracted plain text is what flows into a tool's input (and only that text is
 * later sent to Claude, exactly as if the user had pasted it).
 *
 * Supported: .txt .md .markdown .csv .tsv .json .log (read as text),
 *            .pdf (pdf.js, text layer only), .docx (mammoth).
 */

export interface ExtractResult {
  text: string;
  warnings: string[];
}

const TEXT_EXTENSIONS = [
  "txt",
  "md",
  "markdown",
  "mdx",
  "csv",
  "tsv",
  "json",
  "log",
  "text",
  "rtf",
];

export const ACCEPTED_EXTENSIONS = [...TEXT_EXTENSIONS, "pdf", "docx"];

export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(",");

/** Max bytes we will attempt to read for a single file (guards the UI). */
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

export function fileExtension(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
}

export function isSupportedFile(name: string): boolean {
  return ACCEPTED_EXTENSIONS.includes(fileExtension(name));
}

export async function extractTextFromFile(file: File): Promise<ExtractResult> {
  const warnings: string[] = [];
  const ext = fileExtension(file.name);

  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — too large to read (limit 25 MB).`,
    );
  }

  if (ext === "pdf") {
    return extractPdf(file);
  }
  if (ext === "docx") {
    return extractDocx(file);
  }
  if (ext === "doc") {
    throw new Error(
      "Legacy .doc files aren't supported — please save as .docx, .pdf, or .txt.",
    );
  }
  if (TEXT_EXTENSIONS.includes(ext) || file.type.startsWith("text/")) {
    const text = await file.text();
    return { text, warnings };
  }

  throw new Error(
    `Unsupported file type ".${ext || "?"}". Supported: ${ACCEPTED_EXTENSIONS.map((e) => "." + e).join(", ")}.`,
  );
}

async function extractDocx(file: File): Promise<ExtractResult> {
  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const warnings = (result.messages || [])
    .filter((m: { type: string }) => m.type === "warning")
    .map((m: { message: string }) => m.message);
  const text = result.value.trim();
  if (!text) {
    throw new Error(`No extractable text found in ${file.name}.`);
  }
  return { text, warnings };
}

async function extractPdf(file: File): Promise<ExtractResult> {
  const warnings: string[] = [];
  const pdfjs = await import("pdfjs-dist");
  // Worker is copied into /public at build time (see scripts/copy-pdf-worker.mjs).
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item) => ("str" in item ? (item as { str: string }).str : ""))
      .filter(Boolean);
    pages.push(strings.join(" "));
  }
  await doc.destroy().catch(() => {});

  const text = pages.join("\n\n").replace(/[ \t]+\n/g, "\n").trim();
  if (!text) {
    throw new Error(
      `No text layer found in ${file.name}. It may be a scanned/image PDF (OCR isn't supported).`,
    );
  }
  if (text.length < doc.numPages * 20) {
    warnings.push(
      "This PDF has very little selectable text — if it's scanned, the result may be incomplete.",
    );
  }
  return { text, warnings };
}
