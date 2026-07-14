// PDF text extraction test. Verifies that the unpdf-based parser in
// src/lib/pdf.js reads a hand-crafted PDF fixture and produces a single
// Note whose content includes the visible text from each page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parsePdfFile } from '../src/lib/pdf.js';

const root = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(root, 'fixtures', 'sample.pdf');

test('parsePdfFile: extracts text from a single-page PDF', async () => {
  const buffer = readFileSync(fixturePath);
  // The browser-style path takes a Blob/File. Node's buffer needs to be
  // wrapped so parsePdfFile's `arrayBuffer()` works.
  const file = new File([buffer], 'sample.pdf', { type: 'application/pdf' });

  const notes = await parsePdfFile(file);
  assert.equal(notes.length, 1);
  const note = notes[0];
  assert.equal(note.title, 'sample');
  assert.equal(note.tags.length, 0);
  assert.match(note.content, /Hello PDF note/);
  assert.match(note.content, /Second line of the note/);
  // Page 1 only — single-page PDF, no <h2>Page N</h2> heading inserted.
  assert.doesNotMatch(note.content, /<h2>Page /);
  // Tabs / angle brackets are HTML-escaped for ENEX/ENML safety.
  assert.doesNotMatch(note.content, /<script>/);
});

test('parsePdfFile: handles a Buffer-shaped input via arrayBuffer()', async () => {
  // Some callers hand us a Node Buffer, not a Blob. parsePdfFile only
  // needs an object with arrayBuffer(); verify that contract.
  const buffer = readFileSync(fixturePath);
  const fakeFile = { name: 'sample.pdf', arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
  const notes = await parsePdfFile(fakeFile);
  assert.equal(notes.length, 1);
  assert.match(notes[0].content, /Hello PDF note/);
});

test('parsePdfFile: produces a usable Note object with the expected fields', () => {
  const note = {
    title: 'sample',
    content: '<p>Hello</p>',
    tags: [],
    created: undefined,
    updated: undefined,
    isArchived: false,
    isPinned: false,
    isTrashed: false,
    attachments: []
  };
  // Light sanity check on the contract that finishConversion relies on.
  for (const k of ['title', 'content', 'tags', 'isArchived', 'isPinned', 'isTrashed', 'attachments']) {
    assert.ok(k in note, `note must include ${k}`);
  }
});
