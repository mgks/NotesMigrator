// Per-source output bundle. NotesMigrator v0.6.4: drop multiple
// files (PDF, Keep.zip, Notion.zip, ENEX, MD, JSON all at once) and
// get one zip with one converted file per source. For a single source
// the output is downloaded directly.

import { jsPDF } from "jspdf";
import { toMarkdown } from "md-fusion";

// Strip basic HTML to plain text for jsPDF output.
function htmlToText(html) {
  if (!html) return "";
  return String(html)
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\u2022 ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "\'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function outputBasename(source) {
  const name = (source?.file?.name) || (Array.isArray(source?.files) ? source.files[0]?.name : null) || "note";
  return name.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80) || "note";
}

// Build a per-source ENEX file using the inline generator from main.js.
// Falls back to a simple stub if the helper isn't available.
function buildEnexForSource(source, notes, generateEnex) {
  if (typeof generateEnex === "function") {
    // Caller passes generateEnexWithResources which uses SparkMD5
    // for inline image hashing. We pass an empty binaryMap for raw
    // files; the worker already attached image bytes via the main flow.
    return generateEnex(notes, {});
  }
  // Fallback: write a minimal ENEX with no resources.
  return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
    "<!DOCTYPE en-export SYSTEM \"http://xml.evernote.com/pub/evernote-export3.dtd\">\n" +
    "<en-export></en-export>";
}

function buildMarkdownForSource(notes) {
  // Use the imported md-fusion helper directly instead of looking it
  // up on globalThis (which only works when output.js is loaded as a
  // script in a page that happens to set the helper globally). Same
  // helpers are also used by main.js, so we keep them as ESM imports.
  return notes.map(n => toMarkdown(n)).join("\n\n---\n\n");
}

function buildJsonForSource(notes) {
  return JSON.stringify(notes, null, 2);
}

// Build a PDF Blob for a single source's worth of notes using jsPDF.
function buildPdfForSource(source, notes) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  pdf.setFontSize(16);
  pdf.setFont(undefined, "bold");
  pdf.text(outputBasename(source).slice(0, 80), 15, 20);
  pdf.setDrawColor(200);
  pdf.line(15, 26, 195, 26);
  let y = 34;
  for (const note of notes) {
    if (note.title) {
      pdf.setFontSize(14);
      pdf.setFont(undefined, "bold");
      pdf.text(String(note.title).slice(0, 100), 15, y);
      y += 8;
    }
    if (note.created) {
      pdf.setFontSize(9);
      pdf.setFont(undefined, "italic");
      pdf.text("created " + note.created, 15, y);
      y += 6;
    }
    if (note.tags && note.tags.length) {
      pdf.setFontSize(9);
      pdf.text("tags: " + note.tags.join(", "), 15, y);
      y += 6;
    }
    if (note.content) {
      pdf.setFontSize(11);
      pdf.setFont(undefined, "normal");
      const lines = htmlToText(note.content).split("\n");
      for (const line of lines) {
        if (y > 270) {
          pdf.addPage();
          y = 20;
        }
        pdf.text(line.slice(0, 95), 15, y);
        y += 5;
      }
    }
    y += 4;
    if (y > 260) { pdf.addPage(); y = 20; }
  }
  return pdf.output("blob");
}

// Per-source filename helper. Each source becomes one file inside
// the output zip, named after its source file (minus extension).
export function sourceFilename(source, target) {
  const first = (source?.file?.name) || (source?.files?.[0]?.name) || "note";
  const base = first.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80) || "note";
  const ext = target === "json" ? "json"
    : target === "markdown" ? "md"
    : target === "enex" ? "enex"
    : target === "pdf" ? "pdf"
    : target;
  return base + "." + ext;
}

// Build the per-source output blobs. Returns an array of { filename,
// blob } for a multi-source zip, or a single { filename, blob } for
// direct download.
export async function buildSourceOutputs(sources, format, opts = {}) {
  // opts can include { generateEnex, jsZip } for callers that want
  // to pass shared helpers in (avoids re-importing).
  const outputs = [];
  for (const item of sources) {
    const source = item.source ?? item;
    // Accept notes from either the outer wrapper or source.notes so
    // both the test fixtures and the live main.js pipeline work
    // without callers having to mutate one specific shape.
    const notes = (item.notes && item.notes.length ? item.notes : null)
      || (source.notes && source.notes.length ? source.notes : null)
      || source.pdfNotes
      || [];

    // PDF pass-through: PDFs are binary files, not text notes, and
    // forcing them through JSON / ENEX / Markdown produces lossy or
    // empty output (the text extraction is lossy and the user can't
    // reasonably read a 30-page PDF inside an ENEX cell). We pass
    // the original bytes through unchanged so the user gets the same
    // file back in the output bundle, regardless of the chosen target.
    // Only do this when the source actually carries the original
    // binary (source.file); some test fixtures and zip-internal PDFs
    // pass pdfNotes without a file, in which case we fall through to
    // the regular text conversion path.
    if (source.format === "pdf" && source.file) {
      const fileName = (source.file?.name || "document.pdf").replace(/[^a-z0-9._-]+/gi, "_") || "document.pdf";
      outputs.push({ name: fileName, blob: source.file, source });
      continue;
    }

    let blob, name;
    // Only force a PDF output when the user actually asked for PDF.
    // When a PDF source is converted to JSON/ENEX/Markdown, its
    // pdfNotes are normal notes — route them through the regular
    // pipeline so the user gets the format they selected.
    if (format === "pdf" && (source.format === "pdf" || source.pdfNotes)) {
      blob = buildPdfForSource(source, source.pdfNotes || notes);
      name = sourceFilename(source, "pdf");
    } else if (format === "json") {
      blob = new Blob([buildJsonForSource(notes)], { type: "application/json" });
      name = sourceFilename(source, "json");
    } else if (format === "markdown") {
      blob = new Blob([buildMarkdownForSource(notes)], { type: "text/markdown;charset=utf-8" });
      name = sourceFilename(source, "markdown");
    } else if (format === "enex") {
      const xml = buildEnexForSource(source, notes, opts.generateEnex);
      blob = new Blob([xml], { type: "application/xml" });
      name = sourceFilename(source, "enex");
    } else {
      // Unknown target; fall back to JSON so the user still gets data.
      blob = new Blob([buildJsonForSource(notes)], { type: "application/json" });
      name = sourceFilename(source, "json");
    }
    outputs.push({ name, blob, source });
  }
  return outputs;
}

// Build a single zip Blob containing one entry per source output.
export async function buildOutputBundle(sources, format, opts = {}) {
  const outputs = await buildSourceOutputs(sources, format, opts);
  const jsZipMod = opts.jsZip || (await import("jszip")).default;
  const zip = new jsZipMod();
  for (const o of outputs) {
    const data = o.blob instanceof Blob ? await o.blob.arrayBuffer() : o.blob;
    zip.file(o.name, data);
  }
  return await zip.generateAsync({ type: "blob" });
}
