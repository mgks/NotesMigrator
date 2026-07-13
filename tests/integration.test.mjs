import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(root, 'fixtures');

import { parseKeepHtml } from 'gkeep-parser';
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
<div class="content"><ul><li>Milk</li><li>Bread</li></ul></div>
<span class="label">errands</span>
<span class="label">home</span>
<img src="photo.png" />
</body></html>`;
    const n = parseKeepHtml(html);
    assert.equal(n.title, 'Shopping');
    assert.deepEqual(n.tags.sort(), ['errands', 'home']);
    assert.equal(n.attachments.length, 1);
});

test('gkeep-parser FLAW: hard-codes mimeType "image/jpeg" even for PNG', () => {
    const html = `<html><body><img src="photo.png" /></body></html>`;
    const n = parseKeepHtml(html);
    // The flaw: this should be image/png.
    assert.equal(n.attachments[0].mimeType, 'image/jpeg',
        'documented flaw: gkeep-parser hard-codes image/jpeg');
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

test('enex-io FLAW: silently rewrites invalid dates to "now" instead of erroring', () => {
    // Generated with completely invalid dates; enex-io should not silently
    // substitute "today" but it does.
    const out = generateEnex([{
        title: 'Bad date',
        content: 'x',
        created: 'NOT-A-DATE',
        updated: 'NOT-A-DATE',
        tags: []
    }]);
    const notes = parseEnex(out);
    // After the round-trip, the bad date input has been replaced with today's
    // ISO timestamp. That's the flaw: silent, lossless-looking fallback.
    const now = Date.now();
    const ts = Date.parse(notes[0].created);
    assert.ok(Math.abs(now - ts) < 60_000,
        `expected enex-io to silently rewrite to ~now, got ${notes[0].created}`);
    assert.notEqual(notes[0].created, 'NOT-A-DATE');
});

test('enex-io FLAW: parseEnex omits textContent / isArchived / isPinned / isTrashed / attachments', () => {
    // The schema gap means downstream code can not treat gkeep-parser output
    // and enex-io output interchangeably.
    const out = generateEnex([{ title: 'T', content: 'c', created: '20260101T000000Z', updated: '20260101T000000Z', tags: [] }]);
    const notes = parseEnex(out);
    assert.ok(!('textContent' in notes[0]), 'documented schema gap');
    assert.ok(!('isArchived' in notes[0]),  'documented schema gap');
    assert.ok(!('attachments' in notes[0]), 'documented schema gap');
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
