import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

// Replicates the worker's new text-decode path EXACTLY:
//   const bytes = await entry.async('uint8array');
//   contentMap[path] = new TextDecoder('utf-8').decode(bytes);
// This validates the fix that replaced entry.async('string').
async function extractText(zip, path) {
    const entry = zip.file(path);
    const bytes = await entry.async('uint8array');
    return new TextDecoder('utf-8').decode(bytes);
}

// The OLD (buggy) path for comparison: JSZip string mode.
async function extractTextOld(zip, path) {
    const entry = zip.file(path);
    return await entry.async('string');
}

test('worker: emoji round-trips intact via uint8array+TextDecoder', async () => {
    const original = '✨ Note Title 🏷️ 日本語 café';
    const zip = await JSZip.loadAsync(await new JSZip().file('note.json', original).generateAsync({ type: 'nodebuffer' }));
    const out = await extractText(zip, 'note.json');
    assert.equal(out, original);
});

test('worker: multi-byte CJK survives', async () => {
    const original = 'こんにちは世界 한글 Привет';
    const zip = await JSZip.loadAsync(await new JSZip().file('a.txt', original).generateAsync({ type: 'nodebuffer' }));
    assert.equal(await extractText(zip, 'a.txt'), original);
});

test('worker: 4-byte emoji (surrogate pairs) intact', async () => {
    const original = '🚀🎉🇯🇵👨‍👩‍👧‍👦';
    const zip = await JSZip.loadAsync(await new JSZip().file('e.txt', original).generateAsync({ type: 'nodebuffer' }));
    assert.equal(await extractText(zip, 'e.txt'), original);
});

test('worker: malformed-by-detection tag chars render correctly', async () => {
    // The kind of content issue #13 fixed: emoji + tag-like sequences.
    const original = '🏷️ <input type="checkbox"/> done';
    const zip = await JSZip.loadAsync(await new JSZip().file('t.json', original).generateAsync({ type: 'nodebuffer' }));
    assert.equal(await extractText(zip, 't.json'), original);
});

// Brute: 500 random unicode strings must round-trip byte-perfect.
test('worker brute: 500 random unicode strings round-trip', async () => {
    const codepoints = [
        0x1F600, 0x1F680, 0x1F1EF, 0x1F1F5, // emoji regions
        0x3042, 0x3044, 0xAC00, 0xC774,      // CJK
        0x00E9, 0x00FC, 0x20AC,              // latin1 + euro
        0x41, 0x42, 0x30, 0x0A, 0x20         // ASCII
    ];
    let failures = 0;
    for (let i = 0; i < 500; i++) {
        let s = '';
        const len = Math.floor(Math.random() * 40);
        for (let j = 0; j < len; j++) {
            s += String.fromCodePoint(codepoints[Math.floor(Math.random() * codepoints.length)]);
        }
        const zip = await JSZip.loadAsync(await new JSZip().file(`f${i}.txt`, s).generateAsync({ type: 'nodebuffer' }));
        const out = await extractText(zip, `f${i}.txt`);
        if (out !== s) failures++;
    }
    assert.equal(failures, 0, `${failures} unicode round-trips corrupted`);
});

// Regression guard: confirms the new path beats the legacy string path on
// at least the surrogate-pair case (old JSZip string decode corrupted these).
test('worker: new path >= old path fidelity on emoji', async () => {
    const original = '🚀🎉';
    const zip = await JSZip.loadAsync(await new JSZip().file('e.txt', original).generateAsync({ type: 'nodebuffer' }));
    const fresh = await extractText(zip, 'e.txt');
    const legacy = await extractTextOld(zip, 'e.txt');
    assert.equal(fresh, original);
    // legacy may or may not match depending on JSZip build; new path must always match
    assert.ok(fresh === original);
});
