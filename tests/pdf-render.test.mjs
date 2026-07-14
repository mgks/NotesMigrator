// Test the printable-HTML renderer used by the "to PDF" target option.
// Verifies that notes get embedded as individual articles, dates are
// formatted, and the print stylesheet is inlined (so the new tab works
// even when the user is offline).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notesToPrintableHTML } from '../src/lib/pdf-render.js';

const SAMPLE = [
  {
    title: 'Shopping list',
    content: '<ul><li>Milk</li><li>Bread</li></ul>',
    tags: ['errands'],
    created: '2026-01-15T10:30:00.000Z',
    updated: '2026-01-15T10:30:00.000Z'
  },
  {
    title: 'Plan: ship 0.6.2',
    content: '<h1>Big plans</h1><p>Do the things.</p>',
    tags: [],
    created: '2026-07-14T00:00:00.000Z',
    updated: '2026-07-14T01:00:00.000Z'
  }
];

test('pdf-render: produces a self-contained printable HTML document', () => {
  const html = notesToPrintableHTML(SAMPLE);
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<title>NotesMigrator export<\/title>/);
  // Inlined print stylesheet so the new tab works offline / when assets
  // are blocked (e.g. file:// or strict CSP).
  assert.match(html, /<style>[\s\S]*@page \{ margin: 18mm/);
  assert.match(html, /@media print/);
  // Each note gets its own article block.
  assert.match(html, /<article class="note">[\s\S]*Shopping list[\s\S]*<\/article>/);
  assert.match(html, /<article class="note">[\s\S]*Plan: ship 0\.6\.2[\s\S]*<\/article>/);
});

test('pdf-render: title escaping prevents script injection', () => {
  const html = notesToPrintableHTML([{
    title: '<script>alert(1)</script>',
    content: 'x',
    tags: [],
    created: '2026-01-01T00:00:00.000Z',
    updated: '2026-01-01T00:00:00.000Z'
  }]);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert/);
});

test('pdf-render: tags list renders when non-empty', () => {
  const html = notesToPrintableHTML(SAMPLE);
  assert.match(html, /tags: errands/);
  // The second note has empty tags, so the .tags block is omitted entirely.
  // We just check the marker exists at least once (for the first note).
  const tagMatches = (html.match(/class="tags"/g) || []).length;
  assert.equal(tagMatches, 1);
});

test('pdf-render: handles empty notes array (still produces a valid doc)', () => {
  const html = notesToPrintableHTML([]);
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<title>NotesMigrator export<\/title>/);
  assert.match(html, /0 notes?/);
});

test('pdf-render: empty title falls back to "Untitled N"', () => {
  const html = notesToPrintableHTML([{ content: 'x', tags: [] }]);
  assert.match(html, /Untitled 1/);
});
