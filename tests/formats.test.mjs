import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFormat } from '../src/config/formats.js';

// --- GZIP rejection ---
test('detectFormat throws on .tgz', () => {
    assert.throws(() => detectFormat('archive.tgz', []), /Gzip/);
});
test('detectFormat throws on .tar.gz', () => {
    assert.throws(() => detectFormat('archive.tar.gz', []), /Gzip/);
});

// --- Single-file hard matches ---
test('single .enex -> enex', () => {
    assert.equal(detectFormat('note.enex'), 'enex');
});
test('single .json -> json (not keep)', () => {
    assert.equal(detectFormat('note.json'), 'json');
});
test('single .md -> markdown', () => {
    assert.equal(detectFormat('note.md'), 'markdown');
});
test('single .html -> keep', () => {
    assert.equal(detectFormat('note.html'), 'keep');
});
test('single ._keep -> keep', () => {
    assert.equal(detectFormat('note._keep'), 'keep');
});

// --- Batch / zip detection ---
test('zip md+csv -> notion', () => {
    assert.equal(detectFormat('n.zip', ['a.md', 'b.csv']), 'notion');
});
test('zip with .enex -> enex', () => {
    assert.equal(detectFormat('a.zip', ['n.enex', 'img.png']), 'enex');
});
test('zip with Keep/ folder -> keep', () => {
    assert.equal(detectFormat('Takeout.zip', ['Keep/Note.json', 'Keep/Note.html']), 'keep');
});
test('zip with archive_browser.html -> keep', () => {
    assert.equal(detectFormat('Takeout.zip', ['archive_browser.html', 'Note.html']), 'keep');
});
test('html-only zip -> keep (default)', () => {
    assert.equal(detectFormat('a.zip', ['n.html', 'm.html']), 'keep');
});
test('md-only zip -> markdown', () => {
    assert.equal(detectFormat('a.zip', ['n.md', 'm.md']), 'markdown');
});

// --- THE KEY REGRESSION: JSON-only zip must NOT be misdetected as Keep ---
test('json-only zip without Keep marker -> unknown', () => {
    assert.equal(detectFormat('data.zip', ['a.json', 'b.json']), 'unknown');
});

// --- Unknown ---
test('random ext -> unknown', () => {
    assert.equal(detectFormat('data.bin', ['a.bin']), 'unknown');
});
test('empty file list -> unknown', () => {
    assert.equal(detectFormat('x.unknown', []), 'unknown');
});
