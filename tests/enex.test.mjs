// Tests for ENEX generation.
//
// Regression cover for `RangeError: Invalid string length` on export:
// the generator used to accumulate the whole document with `xml += ...`,
// and ENEX inlines every image as base64 (4/3 inflation), so a large
// Keep archive pushed the single JS string past V8's ~512 MB maximum and
// threw at the very last step of the pipeline.
//
// The fix is structural — return Blob parts and let the Blob constructor
// concatenate in its backing store — so the tests assert the structural
// property (nothing ever accumulates) rather than trying to allocate
// half a gigabyte in CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateEnexParts, indexBinariesByName, toEnexDate } from '../src/lib/enex.js';

const noteWith = (over = {}) => ({
    title: 'A note',
    content: '<div>hello</div>',
    created: '2026-01-02T03:04:05Z',
    ...over
});

// An ArrayBuffer of `n` deterministic bytes.
function bytes(n, seed = 7) {
    const a = new Uint8Array(n);
    for (let i = 0; i < n; i++) a[i] = (i * seed) % 256;
    return a.buffer;
}

const joined = (parts) => parts.join('');

test('returns Blob parts, never a single string', () => {
    // The whole point of the fix: a string return would reintroduce the
    // RangeError at scale, and `new Blob([str])` would silently accept it.
    const parts = generateEnexParts([noteWith()], {});
    assert.ok(Array.isArray(parts), 'must return an array of parts');
    assert.ok(parts.every(p => typeof p === 'string'));
});

test('parts join into a well-formed ENEX document', () => {
    const xml = joined(generateEnexParts([noteWith({ title: 'Hello' })], {}));
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(xml, /<!DOCTYPE en-export/);
    assert.match(xml, /<en-export export-date="\d{8}T\d{6}Z"/);
    assert.match(xml, /<title>Hello<\/title>/);
    assert.match(xml, /<\/en-export>$/);
});

test('every note appears in the output', () => {
    const notes = Array.from({ length: 25 }, (_, i) => noteWith({ title: `Note ${i}` }));
    const xml = joined(generateEnexParts(notes, {}));
    assert.equal(xml.match(/<note>/g).length, 25);
    for (let i = 0; i < 25; i++) assert.ok(xml.includes(`<title>Note ${i}</title>`));
});

test('no single part accumulates the whole document', () => {
    // The precise property that prevents the RangeError: part size is
    // bounded by the largest individual chunk, not by the total. If
    // anyone reintroduces `+=`, max-part-length becomes total-length and
    // this fails.
    const notes = Array.from({ length: 40 }, (_, i) =>
        noteWith({ title: `Note ${i}`, content: 'x'.repeat(20_000) }));
    const parts = generateEnexParts(notes, {});
    const total = parts.reduce((n, p) => n + p.length, 0);
    const largest = Math.max(...parts.map(p => p.length));
    assert.ok(total > 500_000, 'sanity: the fixture should be substantial');
    assert.ok(largest < total / 4, `largest part ${largest} must not approach total ${total}`);
});

test('attachment base64 is emitted as its own part', () => {
    // Image payloads are the parts that get huge; each must stay separate
    // so a multi-hundred-MB export never forms one string.
    const notes = [noteWith({
        attachments: [{ filePath: 'Takeout/Keep/photo.jpg', mimeType: 'image/jpeg' }]
    })];
    const parts = generateEnexParts(notes, { 'Takeout/Keep/photo.jpg': bytes(30_000) });
    const b64 = Buffer.from(bytes(30_000)).toString('base64');
    assert.ok(parts.includes(b64), 'base64 payload must be an unmerged part');
});

test('an attachment produces a resource and an en-media reference', () => {
    const notes = [noteWith({
        attachments: [{ filePath: 'Takeout/Keep/photo.jpg', mimeType: 'image/png' }]
    })];
    const xml = joined(generateEnexParts(notes, { 'Takeout/Keep/photo.jpg': bytes(64) }));
    assert.match(xml, /<resource>/);
    assert.match(xml, /<data encoding="base64">/);
    assert.match(xml, /<mime>image\/png<\/mime>/);
    assert.match(xml, /<file-name>photo\.jpg<\/file-name>/);
    // The en-media hash must match the resource it points at.
    const hash = xml.match(/<en-media type="image\/png" hash="([0-9a-f]{32})"/);
    assert.ok(hash, 'en-media must carry an MD5 hash');
});

test('attachments are matched by basename across differing paths', () => {
    // The binaryMap is keyed by full zip path; attachments carry their own.
    const notes = [noteWith({
        attachments: [{ filePath: 'some/other/dir/photo.jpg', mimeType: 'image/jpeg' }]
    })];
    const xml = joined(generateEnexParts(notes, { 'Takeout/Keep/photo.jpg': bytes(64) }));
    assert.match(xml, /<resource>/);
});

test('a missing binary is skipped without emitting a broken resource', () => {
    const notes = [noteWith({
        attachments: [{ filePath: 'Takeout/Keep/gone.jpg', mimeType: 'image/jpeg' }]
    })];
    const xml = joined(generateEnexParts(notes, {}));
    assert.doesNotMatch(xml, /<resource>/);
    assert.doesNotMatch(xml, /<en-media/);
    assert.match(xml, /<note>/, 'the note itself must survive');
});

test('missing dates fall back to the export timestamp', () => {
    const xml = joined(generateEnexParts([noteWith({ created: null })], {}));
    assert.match(xml, /<created>\d{8}T\d{6}Z<\/created>/);
});

test('updated falls back to created', () => {
    const xml = joined(generateEnexParts(
        [noteWith({ created: '2026-01-02T03:04:05Z', updated: null })], {}));
    const created = xml.match(/<created>(.+?)<\/created>/)[1];
    const updated = xml.match(/<updated>(.+?)<\/updated>/)[1];
    assert.equal(updated, created);
});

test('titles are XML-escaped', () => {
    const xml = joined(generateEnexParts([noteWith({ title: 'a & b <c>' })], {}));
    assert.match(xml, /<title>a &amp; b &lt;c&gt;<\/title>/);
    assert.doesNotMatch(xml, /<title>a & b <c><\/title>/);
});

test('an untitled note gets a placeholder', () => {
    const xml = joined(generateEnexParts([noteWith({ title: '' })], {}));
    assert.match(xml, /<title>Untitled<\/title>/);
});

test('an empty note list still yields a valid document', () => {
    const xml = joined(generateEnexParts([], {}));
    assert.match(xml, /<en-export/);
    assert.match(xml, /<\/en-export>$/);
    assert.doesNotMatch(xml, /<note>/);
});

// --- binary index ---

test('indexBinariesByName maps basename to full path', () => {
    const idx = indexBinariesByName({ 'a/b/photo.jpg': 1, 'c/doc.png': 2 });
    assert.equal(idx.get('photo.jpg'), 'a/b/photo.jpg');
    assert.equal(idx.get('doc.png'), 'c/doc.png');
});

test('indexBinariesByName keeps the first key on a basename collision', () => {
    // Matches the scan order of the Object.keys().find() it replaced.
    const idx = indexBinariesByName({ 'first/photo.jpg': 1, 'second/photo.jpg': 2 });
    assert.equal(idx.get('photo.jpg'), 'first/photo.jpg');
});

// --- dates ---

test('toEnexDate emits basic-ISO', () => {
    assert.equal(toEnexDate('2026-01-02T03:04:05.678Z'), '20260102T030405Z');
});

test('toEnexDate rejects unusable input', () => {
    assert.equal(toEnexDate(null), null);
    assert.equal(toEnexDate(''), null);
    assert.equal(toEnexDate('not a date'), null);
});

test('toEnexDate accepts a Date', () => {
    assert.equal(toEnexDate(new Date('2026-01-02T03:04:05Z')), '20260102T030405Z');
});
