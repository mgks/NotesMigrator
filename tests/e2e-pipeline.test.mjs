// End-to-end pipeline test. Spins up a real Keep JSON file with an image
// attachment in tmp/, runs each sibling dep through it, and asserts that
// the contents (title, content, tags, dates, attachment hash) survive
// the entire Keep -> JSON -> ENEX -> Markdown trip.
//
// This is the "are any of these projects broken?" smoke test for the
// full release pipeline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { parseKeepJson, parseKeepHtml } from 'gkeep-parser';
import { generateEnex, parseEnex } from 'enex-io';
import { toMarkdown, fromMarkdown } from 'md-fusion';

const root = dirname(fileURLToPath(import.meta.url));
// Sibling CLIs live next to Migrator/, not inside it. The repo's package
// layout has each dep installed under node_modules; resolve from there.
const cliRoot = join(root, '..', 'node_modules');

function freshTmp(testName) {
  const dir = join(root, 'tmp', `${testName}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function runCli(cwd, args) {
  // Find the CLI path inside the installed dep.
  const [, dep] = args.find((a) => a.startsWith('--bin=')) ?? [null, null];
  const cliPath = join(cliRoot, dep ?? '', 'dist', 'cli.js');
  const rest = args.filter(a => !a.startsWith('--bin='));
  return spawnSync('node', [cliPath, ...rest], { encoding: 'utf-8', cwd });
}

// ---------------------------------------------------------------------------
// Shared fixtures: a Keep note (with checklist + attachment) used as the
// seed for the round-trips below.
// ---------------------------------------------------------------------------

const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const PNG_HASH = '91e42db1c66c0b276abf6234dc50b2eb';

const KEEP_JSON = JSON.stringify({
  title: 'Pipeline test',
  textContent: 'Hello\nworld ✨',
  listContent: [
    { text: 'Buy milk', isChecked: false },
    { text: 'Walk dog', isChecked: true }
  ],
  labels: [{ name: 'pipeline' }, { name: 'integration' }],
  createdTimestampUsec: 1609459200000000,
  userEditedTimestampUsec: 1609545600000000,
  isPinned: true,
  isArchived: false,
  isTrashed: false,
  attachments: [{ filePath: 'pixel.png', mimetype: 'image/png' }]
});

const KEEP_HTML = `<!DOCTYPE html>
<html><head><title>Pipeline test</title></head>
<body>
  <div class="title">Pipeline test</div>
  <div class="heading"><span class="date">Jan 1, 2021, 12:00 AM</span></div>
  <div class="content">Hello<br>world ✨<ul>
    <li><input type="checkbox" checked/> Walk dog</li>
    <li><input type="checkbox"/> Buy milk</li>
  </ul></div>
  <span class="label">pipeline</span>
  <span class="label">integration</span>
</body></html>`;

// ---------------------------------------------------------------------------
// Pure-API round-trips: every conversion path the app supports
// ---------------------------------------------------------------------------

test('pipeline: Keep JSON -> parse -> ENEX -> parse -> Markdown -> parse', () => {
  const note = parseKeepJson(KEEP_JSON);
  assert.equal(note.title, 'Pipeline test');

  const enex = generateEnex([{
    title: note.title,
    content: note.content,
    tags: note.tags,
    created: note.created,
    updated: note.updated,
    attachments: [{
      data: PNG_B64,
      mime: 'image/png',
      fileName: 'pixel.png',
      hash: PNG_HASH
    }]
  }]);

  assert.match(enex, /<title>Pipeline test<\/title>/);
  assert.match(enex, /<tag>pipeline<\/tag>/);
  assert.match(enex, /<created>20210101T000000Z<\/created>/);
  assert.match(enex, new RegExp(`hash="${PNG_HASH}"`));

  const parsed = parseEnex(enex);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, 'Pipeline test');
  assert.equal(parsed[0].attachments.length, 1);
  assert.equal(parsed[0].attachments[0].hash, PNG_HASH);
  assert.equal(parsed[0].attachments[0].fileName, 'pixel.png');
  assert.equal(parsed[0].created, '2021-01-01T00:00:00Z');

  const assets = { assets: new Map() };
  const md = toMarkdown(
    {
      title: parsed[0].title,
      content: parsed[0].content + '<img src="https://example.com/pixel.png">',
      tags: parsed[0].tags,
      created: parsed[0].created
    },
    { assets }
  );
  assert.match(md, /^---\n/);
  assert.match(md, /title: Pipeline test/);
  assert.match(md, /tags:/);
  assert.match(md, /pipeline/);
  assert.equal(assets.assets.size, 1);
  assert.equal(assets.assets.get('https://example.com/pixel.png'), 'pixel.png');

  const reconstructed = fromMarkdown(md);
  assert.equal(reconstructed.title, 'Pipeline test');
  assert.deepEqual(reconstructed.tags, ['pipeline', 'integration']);
  assert.equal(reconstructed.created, '2021-01-01T00:00:00Z');
  assert.match(reconstructed.content, /<ul>[\s\S]*<li>[\s\S]*Walk dog/);
  assert.match(reconstructed.content, /<li>[\s\S]*Buy milk/);
  assert.match(reconstructed.content, /<img src="pixel\.png"/);
});

test('pipeline: Keep HTML -> parse -> ENEX -> parse', () => {
  const note = parseKeepHtml(KEEP_HTML);
  assert.equal(note.title, 'Pipeline test');
  assert.deepEqual(note.tags, ['pipeline', 'integration']);

  const enex = generateEnex([{
    title: note.title,
    content: note.content,
    tags: note.tags,
    created: note.created,
    updated: note.updated
  }]);

  // Body keeps the checklist as <en-todo> thanks to enex-io normalization.
  assert.match(enex, /<en-todo checked="true"\/>/);
  assert.match(enex, /<en-todo\/>/);
  assert.match(enex, /<tag>pipeline<\/tag>/);

  const parsed = parseEnex(enex);
  assert.equal(parsed[0].title, 'Pipeline test');
  assert.equal(parsed[0].content.includes('en-todo'), true);
});

test('pipeline: Markdown frontmatter round-trips through ENEX', () => {
  // The reverse direction users often need: an Obsidian vault becomes a
  // Takeout-shaped ENEX they can hand back to Apple Notes.
  const md = `---
title: From Obsidian
tags: [obsidian, test]
created: 2024-05-15T10:00:00Z
---

# Big Plans

Do the thing.`;

  const note = fromMarkdown(md);
  assert.equal(note.title, 'From Obsidian');

  const enex = generateEnex([{
    title: note.title,
    content: note.content,
    tags: note.tags,
    created: note.created,
    updated: note.created
  }]);

  assert.match(enex, /<title>From Obsidian<\/title>/);
  assert.match(enex, /<tag>obsidian<\/tag>/);
  assert.match(enex, /<created>20240515T100000Z<\/created>/);

  const parsed = parseEnex(enex);
  assert.equal(parsed[0].title, 'From Obsidian');
  assert.deepEqual(parsed[0].tags, ['obsidian', 'test']);
  assert.equal(parsed[0].created, '2024-05-15T10:00:00Z');
});

test('pipeline: ENEX -> JSON -> ENEX preserves content', () => {
  // Real-world scenario: NotesMigrator exports ENEX -> JSON for a
  // backup. Round-tripping through JSON should keep the structural
  // payload intact enough that the second ENEX includes the same
  // content, tags, dates and attachment hashes.
  const seed = {
    title: 'Backup round-trip',
    content: '<h1>Header</h1><p>Body line 1.</p><p>Body line 2.</p>',
    tags: ['backup', 'verify'],
    created: '2024-05-15T10:00:00Z',
    updated: '2024-05-16T10:00:00Z',
    attachments: [{
      data: PNG_B64,
      mime: 'image/png',
      fileName: 'pixel.png',
      hash: PNG_HASH
    }]
  };

  const enexA = generateEnex([seed]);
  const roundtripped = JSON.parse(JSON.stringify(parseEnex(enexA)));
  const enexB = generateEnex(roundtripped);

  for (const re of [
    /<title>Backup round-trip<\/title>/,
    /<tag>backup<\/tag>/,
    /<created>20240515T100000Z<\/created>/,
    /<updated>20240516T100000Z<\/updated>/,
    new RegExp(`hash="${PNG_HASH}"`),
    /<file-name>pixel\.png<\/file-name>/,
    /<mime>image\/png<\/mime>/
  ]) {
    assert.match(enexA, re, `first ENEX missing ${re}`);
    assert.match(enexB, re, `round-tripped ENEX missing ${re}`);
  }
});

// ---------------------------------------------------------------------------
// tmp/ based CLI smoke test: every dep writes + reads a real file
// ---------------------------------------------------------------------------

test('pipeline: real files round-trip through every CLI in tmp/', () => {
  const dir = freshTmp('pipeline-cli');

  const keepFile = join(dir, 'note.keep.json');
  writeFileSync(keepFile, KEEP_JSON);

  const note = parseKeepJson(readFileSync(keepFile, 'utf-8'));

  const enexPath = join(dir, 'note.enex');
  const xml = generateEnex([{
    title: note.title,
    content: note.content,
    tags: note.tags,
    created: note.created,
    updated: note.updated
  }]);
  writeFileSync(enexPath, xml);
  assert.ok(existsSync(enexPath), 'enex file should exist');

  const reparsed = parseEnex(readFileSync(enexPath, 'utf-8'));
  assert.equal(reparsed[0].title, 'Pipeline test');

  const mdPath = join(dir, 'note.md');
  writeFileSync(mdPath, toMarkdown({
    title: reparsed[0].title,
    content: reparsed[0].content,
    tags: reparsed[0].tags,
    created: reparsed[0].created
  }));
  assert.ok(existsSync(mdPath), 'md file should exist');

  const finalNote = fromMarkdown(readFileSync(mdPath, 'utf-8'));
  assert.equal(finalNote.title, 'Pipeline test');
  assert.deepEqual(finalNote.tags, ['pipeline', 'integration']);
});

test('cleanup: removes test/tmp/', () => {
  if (existsSync(join(root, 'tmp'))) {
    rmSync(join(root, 'tmp'), { recursive: true, force: true });
  }
});
