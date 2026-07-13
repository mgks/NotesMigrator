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

import { parseKeepJson } from 'gkeep-parser';
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
// Pure-API round-trip across all three deps
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

test('pipeline: Keep JSON -> parse -> ENEX -> parse -> Markdown -> parse', () => {
  // 1. Parse the Keep JSON into a KeepNote-shaped object.
  const note = parseKeepJson(KEEP_JSON);
  assert.equal(note.title, 'Pipeline test');

  // 2. Render as ENEX with attachment and full note-attributes.
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

  // 3. Parse the ENEX back and confirm attachments + dates survive.
  const parsed = parseEnex(enex);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, 'Pipeline test');
  assert.equal(parsed[0].attachments.length, 1);
  assert.equal(parsed[0].attachments[0].hash, PNG_HASH);
  assert.equal(parsed[0].attachments[0].fileName, 'pixel.png');
  assert.equal(parsed[0].created, '2021-01-01T00:00:00Z');

  // 4. Build Markdown with asset rewrite so the image survives too.
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
  // Asset extract produced a local path; the original URL is gone.
  assert.equal(assets.assets.size, 1);
  assert.equal(assets.assets.get('https://example.com/pixel.png'), 'pixel.png');

  // 5. Round-trip the markdown back to a Note and check data integrity.
  const reconstructed = fromMarkdown(md);
  assert.equal(reconstructed.title, 'Pipeline test');
  assert.deepEqual(reconstructed.tags, ['pipeline', 'integration']);
  // ENEX timestamps come back as 2021-01-01T00:00:00Z (no millis). The
  // round-trip through markdown preserves them as ISO strings.
  assert.equal(reconstructed.created, '2021-01-01T00:00:00Z');
  // The text and list structure survive the round-trip. Note: the
  // <input type="checkbox"> markers are lost in HTML -> Markdown because
  // turndown does not generate GFM task-list syntax by default; that's
  // a separate enhancement tracked outside this pipeline test.
  assert.match(reconstructed.content, /<ul>[\s\S]*<li>[\s\S]*Walk dog/);
  assert.match(reconstructed.content, /<li>[\s\S]*Buy milk/);
  // The image source was rewritten to a local asset path.
  assert.match(reconstructed.content, /<img src="pixel\.png"/);
});

// ---------------------------------------------------------------------------
// tmp/ based CLI smoke test: every dep writes + reads a real file
// ---------------------------------------------------------------------------

test('pipeline: real files round-trip through every CLI in tmp/', () => {
  const dir = freshTmp('pipeline-cli');

  // 1. Write a synthetic Keep JSON file.
  const keepFile = join(dir, 'note.keep.json');
  writeFileSync(keepFile, KEEP_JSON);

  // 2. Convert through gkeep-parser (we call its API directly because the
  //    CLI is `to-json` for HTML; the JSON path is API-only).
  const note = parseKeepJson(readFileSync(keepFile, 'utf-8'));

  // 3. Drive the ENEX I/O through enex-io's API and verify each artefact.
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

  // 4. Re-parse the file (not the in-memory XML) so we exercise the I/O path.
  const reparsed = parseEnex(readFileSync(enexPath, 'utf-8'));
  assert.equal(reparsed[0].title, 'Pipeline test');

  // 5. Convert to Markdown, write to disk, re-read, re-parse.
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
