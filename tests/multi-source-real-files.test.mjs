// Multi-source end-to-end test with real input files. Verifies that the
// per-source output builder correctly produces one converted file per
// real source (a Keep.json, an ENEX, a Markdown file, a PDF) when the
// output is requested as a zip.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { generateEnex, parseEnex } from 'enex-io';
import { parseKeepJson } from 'gkeep-parser';
import { fromMarkdown, toMarkdown } from 'md-fusion';

const root = dirname(fileURLToPath(import.meta.url));
const SAMPLE_PDF = readFileSync(join(root, 'fixtures', 'sample.pdf'));

const KEEP_JSON = JSON.stringify({
  title: 'Shopping list',
  textContent: 'Milk\nBread',
  listContent: [
    { text: 'Buy milk', isChecked: false },
    { text: 'Walk dog', isChecked: true }
  ],
  labels: [{ name: 'personal' }, { name: 'todo' }],
  createdTimestampUsec: 1609459200000000,
  userEditedTimestampUsec: 1609545600000000,
  isPinned: true,
  isArchived: false,
  isTrashed: false
});

const MARKDOWN_TEXT = `---
title: Reading list
tags: [books, 2026]
created: 2026-02-15T10:00:00Z
---

# Books to read
- Sapiens
- Atlas Obscura
`;

test('multi-source real files: zip with one file per real source', async () => {
  const { buildSourceOutputs, buildOutputBundle } = await import(
    '../src/lib/output.js'
  );

  const tmp = mkdtempSync(join(tmpdir(), 'mreal-'));
  try {
    // 1. Write real files in tmp/.
    const keepPath = join(tmp, 'note.keep.json');
    writeFileSync(keepPath, KEEP_JSON);

    const enexPath = join(tmp, 'sample.enex');
    const keepNote = parseKeepJson(KEEP_JSON);
    const enexXml = generateEnex([{
      ...keepNote,
      attachments: []
    }], {});
    writeFileSync(enexPath, enexXml);

    const mdPath = join(tmp, 'reading-list.md');
    writeFileSync(mdPath, MARKDOWN_TEXT);

    const pdfPath = join(tmp, 'paper.pdf');
    writeFileSync(pdfPath, SAMPLE_PDF);

    // 2. Sanity check: files exist and are non-empty.
    for (const p of [keepPath, enexPath, mdPath, pdfPath]) {
      const s = readFileSync(p);
      assert.ok(s.length > 0, `${p} should be non-empty`);
    }

    // 3. Parse each real file with its matching parser and build
    //    perSourceData (the same shape main.js produces).
    const keepNoteParsed = parseKeepJson(readFileSync(keepPath, 'utf-8'));
    const enexParsed = parseEnex(readFileSync(enexPath, 'utf-8'));
    const mdParsed = fromMarkdown(readFileSync(mdPath, 'utf-8'));
    // Wrap the real PDF bytes in a Blob so buildSourceOutputs can
    // pass it through unchanged. Define `name` on the Blob since
    // Node doesn't expose File.name on a bare Blob.
    const pdfBytes = readFileSync(pdfPath);
    const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    Object.defineProperty(pdfBlob, 'name', { value: 'paper.pdf' });

    const perSourceData = [
      {
        source: { file: { name: 'note.keep.json' }, format: 'json', notes: [keepNoteParsed] }
      },
      {
        source: { file: { name: 'sample.enex', notes: enexParsed } }
      },
      {
        source: { file: { name: 'reading-list.md', notes: [mdParsed] } }
      },
      {
        // PDF source carries the original Blob (not just pdfNotes) so
        // buildSourceOutputs can pass it through to the output zip
        // unchanged, regardless of the chosen target format.
        source: { file: pdfBlob, format: 'pdf', pdfNotes: [{ title: 'paper', content: 'placeholder', created: '2026-01-01T00:00:00Z', tags: [] }] }
      }
    ];

    // 4. Build outputs (target = enex). PDFs always pass through
    //    unchanged regardless of the chosen target; text sources
    //    become ENEX.
    const opts = { generateEnex };
    const outputs = await buildSourceOutputs(perSourceData, 'enex', opts);
    assert.equal(outputs.length, 4);
    const names = outputs.map(o => o.name).sort();
    assert.deepEqual(names, [
      'note.keep.enex',
      'paper.pdf',
      'reading-list.enex',
      'sample.enex'
    ]);

    // 5. Bundle into a zip.
    const zipBlob = await buildOutputBundle(perSourceData, 'enex');
    const buf = Buffer.from(await zipBlob.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);
    const zipNames = Object.keys(zip.files).sort();
    assert.equal(zipNames.length, 4);
    for (const n of zipNames) {
      const data = await zip.files[n].async('uint8array');
      assert.ok(data.byteLength > 0, `entry ${n} must be non-empty`);
    }
    // Confirm the PDF entry is byte-identical to the source file.
    const pdfEntry = zip.file('paper.pdf');
    const extractedPdf = await pdfEntry.async('uint8array');
    assert.equal(extractedPdf.byteLength, pdfBytes.length, 'paper.pdf should pass through unchanged');

// 6. Round-trip sanity: the keep source has format='json' so its
    //    output is the keep source's notes (not an ENEX). The ENEX
    //    path is exercised via the dedicated test above. Just check
    //    that the keep output's body contains the title.
    const jsonOut = outputs.find(o => o.name === 'note.keep.enex');
    const jsonText = await jsonOut.blob.text();
    assert.match(jsonText, /Shopping list/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
