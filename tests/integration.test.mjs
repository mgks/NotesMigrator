import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(root, 'fixtures');

import { parseKeepHtml, parseKeepJson, isKeepImage } from 'gkeep-parser';
import { parseEnex, generateEnex } from 'enex-io';
import { toMarkdown, fromMarkdown } from 'md-fusion';

// ---------- gkeep-parser integration ----------
test('gkeep-parser: parses a typical Keep HTML note', () => {
    const html = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html><head><title>Shopping</title></head>
<body>
<div class="title">Shopping</div>
<div class="heading"><span class="date">Jan 15, 2026</span></div>
<div class="content"><ul><li>Milk</li><li>Bread</li></ul><img src="photo.png" /></div>
<span class="label">errands</span>
<span class="label">home</span>
</body></html>`;
    const n = parseKeepHtml(html);
    assert.equal(n.title, 'Shopping');
    assert.deepEqual(n.tags.sort(), ['errands', 'home']);
    assert.equal(n.attachments.length, 1);
});

test('gkeep-parser: mimeType is sniffed from the file extension', () => {
  const cases = [
    ['photo.png', 'image/png'],
    ['photo.jpeg', 'image/jpeg'],
    ['photo.JPEG', 'image/jpeg'],
    ['animated.gif', 'image/gif'],
    ['modern.webp', 'image/webp'],
    ['.photo.svg', 'image/svg+xml'],
    ['unknown.bmp', 'image/bmp'],
    ['no-extension', 'image/jpeg'],   // default when we cannot tell
    ['archive.zip', 'image/jpeg']     // zip is not an image; we fall back to jpeg
  ];
  for (const [path, expected] of cases) {
    const html = `<html><body><div class="content"><img src="${path}"></div></body></html>`;
    const n = parseKeepHtml(html);
    assert.equal(n.attachments[0].mimeType, expected,
      `expected ${expected} for ${path}, got ${n.attachments[0].mimeType}`);
  }
});

test('gkeep-parser: leaves images outside .content alone (no Keep UI logo leak)', () => {
  const html = `<html><body>
    <img src="keep-logo.png" alt="logo">
    <div class="content"><img src="inside.jpg"></div>
  </body></html>`;
  const n = parseKeepHtml(html);
  assert.equal(n.attachments.length, 1);
  assert.equal(n.attachments[0].filePath, 'inside.jpg');
});

test('gkeep-parser: populates the colour swatch when Keep includes one', () => {
  const html = `<html><body>
    <div class="title">T</div>
    <div class="content">x</div>
    <div class="color-container" style="background-color: #fff8dc"></div>
  </body></html>`;
  const n = parseKeepHtml(html);
  assert.equal(n.color, '#fff8dc');
});

test('gkeep-parser: new parseKeepJson API shipped (was previously reimplemented by callers)', () => {
  const js = JSON.stringify({
    title: 'From JSON',
    listContent: [{ text: 'a', isChecked: true }],
    labels: [{ name: 'l' }],
    createdTimestampUsec: 1609459200000000,
    attachments: [{ filePath: 'a.png' }]
  });
  const n = parseKeepJson(js);
  assert.equal(n.title, 'From JSON');
  assert.deepEqual(n.tags, ['l']);
  assert.equal(n.created, '2021-01-01T00:00:00.000Z');
  assert.equal(n.attachments[0].mimeType, 'image/png');
});

test('gkeep-parser: parses a title-less note as "Untitled"', () => {
    const n = parseKeepHtml('<html></html>');
    assert.equal(n.title, 'Untitled');
});

// ---------- enex-io integration ----------
test('enex-io: round-trips a generated note through parseEnex', () => {
    const created = '20260101T120000Z';
    const updated = '20260102T120000Z';
    const out = generateEnex([{
        title: 'Hello',
        content: 'world<br/>line2',
        created,
        updated,
        tags: ['a', 'b']
    }]);
    const notes = parseEnex(out);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].title, 'Hello');
    assert.match(notes[0].content, /line2/);
});

test('enex-io: invalid dates come through as null instead of a silent "now" lie', () => {
    const out = generateEnex([{
        title: 'Bad date',
        content: 'x',
        created: 'NOT-A-DATE',
        updated: 'NOT-A-DATE',
        tags: []
    }]);
    const notes = parseEnex(out);
    assert.equal(notes[0].created, null);
    assert.equal(notes[0].updated, null);
});

test('enex-io: HTML normalisation converts <input type="checkbox"> into <en-todo>', () => {
    const out = generateEnex([{
        title: 'T',
        content: '<input type="checkbox" checked/> done <input type="checkbox"/> open',
        created: '20260101T000000Z',
        updated: '20260101T000000Z',
        tags: []
    }]);
    const notes = parseEnex(out);
    assert.match(notes[0].content, /<en-todo checked="true"\/>/);
    assert.match(notes[0].content, /<en-todo\/>/);
    assert.doesNotMatch(notes[0].content, /<input/);
});

test('enex-io: round-trip preserves an attachment with matching MD5 hash', () => {
    // A 1x1 transparent PNG. MD5 of the decoded bytes, used here directly.
    const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const expectedHash = '91e42db1c66c0b276abf6234dc50b2eb';
    const out = generateEnex([{
        title: 'With attachment',
        content: '<div>photo</div>',
        created: '20260101T000000Z',
        updated: '20260101T000000Z',
        tags: [],
        attachments: [{
            data: pngB64,
            mime: 'image/png',
            fileName: 'pixel.png',
            hash: expectedHash
        }]
    }]);
    const notes = parseEnex(out);
    assert.ok(Array.isArray(notes[0].attachments));
    assert.equal(notes[0].attachments.length, 1);
    assert.equal(notes[0].attachments[0].data, pngB64);
    assert.equal(notes[0].attachments[0].mime, 'image/png');
    assert.equal(notes[0].attachments[0].fileName, 'pixel.png');
    assert.equal(notes[0].attachments[0].hash, expectedHash);
    // The generator also dropped an <en-media hash="..."> marker into the body.
    assert.match(out, new RegExp(`<en-media type="image/png" hash="${expectedHash}"`));
});

test('enex-io: round-trip preserves <note-attributes> author and sourceUrl', () => {
    const out = generateEnex([{
        title: 'Attr',
        content: '<p>x</p>',
        created: '20260101T000000Z',
        updated: '20260101T000000Z',
        tags: [],
        author: 'Ghazi',
        sourceUrl: 'https://keep.google.com/#NOTE/abc'
    }]);
    const notes = parseEnex(out);
    assert.equal(notes[0].author, 'Ghazi');
    assert.equal(notes[0].sourceUrl, 'https://keep.google.com/#NOTE/abc');
});

// ---------- md-fusion integration ----------
test('md-fusion: toMarkdown + fromMarkdown round-trip a simple note', () => {
    const md = toMarkdown({ title: 'T', content: '<p>Hello</p>', tags: ['x'], created: '2026-01-01' });
    assert.match(md, /Hello/);
    assert.match(md, /^---/);
    const parsed = fromMarkdown(md);
    assert.equal(parsed.title, 'T');
    assert.deepEqual(parsed.tags, ['x']);
});

test('md-fusion: markdown bullet list round-trip', () => {
    const md = toMarkdown({ title: 'L', content: '<ul><li>a</li><li>b</li></ul>' });
    assert.match(md, /a/);
    assert.match(md, /b/);
});

// ---------- npm audit meta-test ----------
// If the audit advisory range has changed or the dep was bumped, this skips.
test('md-fusion: js-yaml pinned to a known-vulnerable range (audit regression)', async () => {
    const pkg = JSON.parse(await readFile(join(root, '..', 'node_modules', 'md-fusion', 'package.json'), 'utf8'));
    // Documents a published-ecosystem flaw in md-fusion@0.3.0: its declared range
    // `^4.1.0` falls inside the vulnerable band (<=4.1.1). Once md-fusion is bumped
    // to use ^4.1.2 (or >=4.2), this assertion starts failing and signals the
    // upstream upgrade happened. Locally we resolved via npm audit fix to 4.3.0.
    const range = pkg.dependencies['js-yaml'];
    assert.ok(/[\^~]4\.0\.|[\^~]4\.1\.0|[\^~]4\.1\.1/.test(range),
        `expected vulnerable js-yaml range in md-fusion, got ${range}`);
});

// ---------- optional large-sample loop ----------
function bigKeepHtml(title, nItems) {
    const items = Array.from({ length: nItems }, (_, i) => `<li>item ${i}</li>`).join('');
    return `<html><head><title>${title}</title></head><body><div class="content"><ul>${items}</ul></div></body></html>`;
}
test('brute: 200 Keep HTML notes of varying size parse without throwing', () => {
    let parsed = 0;
    for (let i = 0; i < 200; i++) {
        const n = parseKeepHtml(bigKeepHtml(`N${i}`, 50));
        if (n.title === `N${i}`) parsed++;
    }
    assert.equal(parsed, 200);
});
