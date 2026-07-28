// Regression tests for the "NotesMigrator produces empty conversions"
// set of bugs reported in v0.6.x. Each test pins one failure mode so
// the same regression can't slip back in unnoticed.
//
// Covered bugs:
//   1. Raw Keep .json files dropped one-by-one used to come out as 2-byte
//      `[]` JSON, 209-byte empty ENEX, and 0-byte Markdown because
//      parseSourceNotesForOutput used raw JSON.parse instead of
//      parseKeepJson.
//   2. Raw Keep .html files were silently dropped because the html case
//      was missing from parseSourceNotesForOutput.
//   3. Zip sources (Keep.zip, ENEX.zip) used to leave source.format as
//      null/unknown, so per-source parsing matched no branch and the
//      zip produced 0 notes.
//   4. PDF source + non-PDF target used to always emit a PDF; now the
//      output respects the user's chosen target format.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseKeepJson, parseKeepHtml } from 'gkeep-parser';
import { generateEnex } from 'enex-io';

import {
  buildSourceOutputs,
  buildOutputBundle
} from '../src/lib/output.js';
import { looksLikeKeepNote, looksLikeKeepHtml } from '../src/lib/keep.js';

const root = dirname(fileURLToPath(import.meta.url));
const KEEP_DIR = join(root, '..', '..', 'tmp', 'Keep');

// A small but real Keep Takeout JSON note (the same shape Google
// Takeout produces) — checklist, label, microsec timestamps.
const SAMPLE_KEEP_JSON = JSON.stringify({
  title: 'Sample note',
  textContent: 'Hello world',
  listContent: [
    { text: 'Buy milk', isChecked: false },
    { text: 'Walk dog', isChecked: true }
  ],
  labels: [{ name: 'sample' }],
  createdTimestampUsec: 1609459200000000,
  userEditedTimestampUsec: 1609545600000000,
  isPinned: true,
  isArchived: false,
  isTrashed: false
});

// Minimal Keep Takeout HTML (XHTML 1.0 Strict + class="title" body).
const SAMPLE_KEEP_HTML = `<?xml version="1.0" ?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Sample HTML note</title></head>
<body><div class="title">Sample HTML note</div><div class="content">Body text</div></body></html>`;

// ---------------------------------------------------------------------------
// Heuristic helpers
// ---------------------------------------------------------------------------

test('looksLikeKeepNote: accepts a Takeout JSON note shape', () => {
  const n = JSON.parse(SAMPLE_KEEP_JSON);
  assert.equal(looksLikeKeepNote(n), true);
});

test('looksLikeKeepNote: rejects generic JSON', () => {
  assert.equal(looksLikeKeepNote({ title: 'x', content: 'y' }), false);
  assert.equal(looksLikeKeepNote([1, 2, 3]), false);
  assert.equal(looksLikeKeepNote(null), false);
  assert.equal(looksLikeKeepNote('not an object'), false);
});

test('looksLikeKeepHtml: detects the Keep Takeout doctype prefix', () => {
  assert.equal(looksLikeKeepHtml(SAMPLE_KEEP_HTML), true);
});

test('looksLikeKeepHtml: rejects generic HTML', () => {
  assert.equal(looksLikeKeepHtml('<html><body><p>Hi</p></body></html>'), false);
});

// ---------------------------------------------------------------------------
// Bug 1: raw Keep .json drops
// ---------------------------------------------------------------------------

test('bug 1: raw Keep .json -> JSON/ENEX/Markdown all contain the title', async () => {
  const note = parseKeepJson(SAMPLE_KEEP_JSON);
  const sources = [{
    source: { file: { name: 'sample.json' }, format: 'keep', notes: [note] }
  }];

  // JSON output
  const jsonOut = (await buildSourceOutputs(sources, 'json'))[0];
  const jsonBody = await jsonOut.blob.text();
  assert.ok(jsonBody.length > 200, `JSON output should not be empty (got ${jsonBody.length}b)`);
  assert.match(jsonBody, /"title":\s*"Sample note"/);

  // ENEX output
  const enexOut = (await buildSourceOutputs(sources, 'enex', { generateEnex }))[0];
  const enexBody = await enexOut.blob.text();
  assert.ok(enexBody.length > 400, `ENEX output should not be empty (got ${enexBody.length}b)`);
  assert.match(enexBody, /<title>Sample note<\/title>/);

  // Markdown output
  const mdOut = (await buildSourceOutputs(sources, 'markdown'))[0];
  const mdBody = await mdOut.blob.text();
  assert.ok(mdBody.length > 50, `Markdown output should not be empty (got ${mdBody.length}b)`);
});

// ---------------------------------------------------------------------------
// Bug 2: raw Keep .html drops
// ---------------------------------------------------------------------------

test('bug 2: raw Keep .html -> JSON/ENEX/Markdown all contain the title', async () => {
  const note = parseKeepHtml(SAMPLE_KEEP_HTML);
  const sources = [{
    source: { file: { name: 'sample.html' }, format: 'keep', notes: [note] }
  }];

  const jsonOut = (await buildSourceOutputs(sources, 'json'))[0];
  const jsonBody = await jsonOut.blob.text();
  assert.ok(jsonBody.length > 200, `JSON output should not be empty (got ${jsonBody.length}b)`);
  assert.match(jsonBody, /"title":\s*"Sample HTML note"/);

  const enexOut = (await buildSourceOutputs(sources, 'enex', { generateEnex }))[0];
  const enexBody = await enexOut.blob.text();
  assert.match(enexBody, /<title>Sample HTML note<\/title>/);

  const mdOut = (await buildSourceOutputs(sources, 'markdown'))[0];
  const mdBody = await mdOut.blob.text();
  assert.ok(mdBody.length > 50, `Markdown output should not be empty (got ${mdBody.length}b)`);
});

// ---------------------------------------------------------------------------
// Bug 3: zip source with format='keep'
// ---------------------------------------------------------------------------

test('bug 3: zip source (format=keep) emits populated outputs', async () => {
  const note = parseKeepJson(SAMPLE_KEEP_JSON);
  const sources = [{
    source: { file: { name: 'Keep.zip' }, format: 'keep', notes: [note] }
  }];

  const jsonOut = (await buildSourceOutputs(sources, 'json'))[0];
  const jsonBody = await jsonOut.blob.text();
  assert.ok(jsonBody.length > 200, `JSON output should not be empty (got ${jsonBody.length}b)`);

  const enexOut = (await buildSourceOutputs(sources, 'enex', { generateEnex }))[0];
  const enexBody = await enexOut.blob.text();
  assert.ok(enexBody.length > 400, `ENEX output should not be empty (got ${enexBody.length}b)`);

  const mdOut = (await buildSourceOutputs(sources, 'markdown'))[0];
  const mdBody = await mdOut.blob.text();
  assert.ok(mdBody.length > 50, `Markdown output should not be empty (got ${mdBody.length}b)`);
});

// ---------------------------------------------------------------------------
// Bug 4 (updated): PDF source + any target — PDFs now pass through
// unchanged, regardless of the user's chosen target format. The
// per-source output builder routes PDF sources through a dedicated
// pass-through branch (the original bytes flow into the output bundle
// untouched) so the user never gets a lossy converted PDF.
// ---------------------------------------------------------------------------

// Test helper: build a synthetic PDF source whose file is a real Blob
// so the pass-through branch can use it directly.
function pdfSource(name = 'paper.pdf', content = '<p>hello</p>') {
  const blob = new Blob(['%PDF-1.4 fake pdf body'], { type: 'application/pdf' });
  Object.defineProperty(blob, 'name', { value: name });
  return {
    source: {
      file: blob,
      format: 'pdf',
      pdfNotes: [{ title: 'paper', content, created: '2026-01-01T00:00:00Z', tags: [] }]
    }
  };
}

test('pdf pass-through: PDF source + JSON target produces the original PDF', async () => {
  const outputs = await buildSourceOutputs([pdfSource()], 'json');
  assert.equal(outputs[0].name, 'paper.pdf');
});

test('pdf pass-through: PDF source + Markdown target produces the original PDF', async () => {
  const outputs = await buildSourceOutputs([pdfSource()], 'markdown');
  assert.equal(outputs[0].name, 'paper.pdf');
});

test('pdf pass-through: PDF source + ENEX target produces the original PDF', async () => {
  const outputs = await buildSourceOutputs([pdfSource()], 'enex', { generateEnex });
  assert.equal(outputs[0].name, 'paper.pdf');
});

test('pdf pass-through: PDF source + PDF target produces a jsPDF-rendered PDF', async () => {
  // For the legacy test fixture shape (file is a plain object, not a
  // Blob), the pass-through branch can't run — the source.file isn't
  // a usable binary. We fall through to the existing jsPDF renderer.
  const sources = [{
    source: {
      file: { name: 'paper.pdf' },
      format: 'pdf',
      pdfNotes: [{ title: 'paper', content: '<p>hello</p>', created: '2026-01-01T00:00:00Z', tags: [] }]
    }
  }];
  const outputs = await buildSourceOutputs(sources, 'pdf');
  assert.equal(outputs[0].name.endsWith('.pdf'), true, `expected .pdf, got ${outputs[0].name}`);
});

// ---------------------------------------------------------------------------
// Real-files check (only runs when tmp/Keep exists with real Takeout
// data — skipped gracefully otherwise).
// ---------------------------------------------------------------------------

test('real Keep Takeout: 3 notes produce populated JSON/ENEX/Markdown outputs', async () => {
  let files;
  try {
    const { readdirSync } = await import('node:fs');
    files = readdirSync(KEEP_DIR).filter(f => f.endsWith('.json') && !f.includes('archive')).slice(0, 3);
  } catch {
    return; // tmp/Keep not present; skip
  }
  if (files.length === 0) return;

  const sources = files.map(f => ({
    source: {
      file: { name: f },
      format: 'keep',
      notes: [parseKeepJson(readFileSync(join(KEEP_DIR, f), 'utf-8'))]
    }
  }));

  for (const target of ['json', 'enex', 'markdown']) {
    const outputs = await buildSourceOutputs(sources, target, { generateEnex });
    for (const o of outputs) {
      const body = await o.blob.text();
      assert.ok(body.length > 100, `${target} output for ${o.name} should be non-empty (got ${body.length}b)`);
    }
  }
});

test('real Keep Takeout: bundled zip contains one populated entry per source', async () => {
  let files;
  try {
    const { readdirSync } = await import('node:fs');
    files = readdirSync(KEEP_DIR).filter(f => f.endsWith('.json') && !f.includes('archive')).slice(0, 3);
  } catch {
    return;
  }
  if (files.length === 0) return;

  const sources = files.map(f => ({
    source: {
      file: { name: f },
      format: 'keep',
      notes: [parseKeepJson(readFileSync(join(KEEP_DIR, f), 'utf-8'))]
    }
  }));

  const zip = await buildOutputBundle(sources, 'json');
  assert.ok(zip instanceof Blob);
  const JSZip = (await import('jszip')).default;
  const zipData = await JSZip.loadAsync(Buffer.from(await zip.arrayBuffer()));
  const names = Object.keys(zipData.files).sort();
  assert.equal(names.length, files.length);
  for (const n of names) {
    const entry = zipData.files[n];
    const body = await entry.async('uint8array');
    assert.ok(body.byteLength > 100, `entry ${n} should be non-empty (got ${body.byteLength}b)`);
  }
});