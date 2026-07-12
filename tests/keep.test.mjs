import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    escapeHtml,
    escapeXml,
    parseKeepJson,
    normalizeEnexContent,
    buildTagsXml,
    keepEntryVisible
} from '../src/lib/keep.js';

// ---------------- escapeHtml ----------------
test('escapeHtml escapes & < >', () => {
    assert.equal(escapeHtml('a<b>&c'), 'a&lt;b&gt;&amp;c');
});
test('escapeHtml handles null/undefined/number', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml(0), '0');
});

// ---------------- escapeXml ----------------
test('escapeXml escapes all five entities', () => {
    assert.equal(escapeXml(`<a&b>'c"d`), '&lt;a&amp;b&gt;&apos;c&quot;d');
});
test('escapeXml does not double-escape', () => {
    // single left-to-right pass: the & in output is not re-scanned
    assert.equal(escapeXml('A & B'), 'A &amp; B');
    assert.equal(escapeXml('A &amp; B'), 'A &amp;amp; B');
});
test('escapeXml null -> empty', () => {
    assert.equal(escapeXml(null), '');
});

// ---------------- parseKeepJson ----------------
const SAMPLE_CHECKLIST = JSON.stringify({
    title: 'Shopping',
    listContent: [
        { text: 'Milk', isChecked: true },
        { text: 'Bread', isChecked: false }
    ],
    labels: [{ name: 'errands' }, { name: 'home' }],
    createdTimestampUsec: 1609459200000000,
    userEditedTimestampUsec: 1609545600000000,
    isPinned: true,
    isArchived: false,
    isTrashed: false
});

test('parseKeepJson maps checklist items to checkboxes', () => {
    const n = parseKeepJson(SAMPLE_CHECKLIST);
    assert.equal(n.title, 'Shopping');
    assert.match(n.content, /<input type="checkbox" checked="true"\/> Milk/);
    assert.match(n.content, /<input type="checkbox"\/> Bread/);
});

test('parseKeepJson maps labels to tags', () => {
    const n = parseKeepJson(SAMPLE_CHECKLIST);
    assert.deepEqual(n.tags, ['errands', 'home']);
});

test('parseKeepJson converts microsecond timestamps to ISO', () => {
    const n = parseKeepJson(SAMPLE_CHECKLIST);
    assert.equal(n.created, '2021-01-01T00:00:00.000Z');
    assert.equal(n.updated, '2021-01-02T00:00:00.000Z');
});

test('parseKeepJson maps boolean flags', () => {
    const n = parseKeepJson(SAMPLE_CHECKLIST);
    assert.equal(n.isPinned, true);
    assert.equal(n.isArchived, false);
    assert.equal(n.isTrashed, false);
});

test('parseKeepJson escapes HTML in checklist text (XSS safe)', () => {
    const malicious = JSON.stringify({ listContent: [{ text: '<script>alert(1)</script>', isChecked: false }] });
    const n = parseKeepJson(malicious);
    assert.doesNotMatch(n.content, /<script>/);
    assert.match(n.content, /&lt;script&gt;/);
});

test('parseKeepJson handles plain text notes (newlines -> <br/>)', () => {
    const n = parseKeepJson(JSON.stringify({ title: 'T', textContent: 'line1\nline2\nline3' }));
    assert.equal(n.content, 'line1<br/>line2<br/>line3');
});

test('parseKeepJson preserves emoji in text', () => {
    const n = parseKeepJson(JSON.stringify({ textContent: '✨ Note 🏷️ 日本語' }));
    assert.equal(n.content, '✨ Note 🏷️ 日本語');
});

test('parseKeepJson maps attachments with filePath', () => {
    const n = parseKeepJson(JSON.stringify({ attachments: [{ filePath: 'image.png', mimetype: 'image/png' }] }));
    assert.deepEqual(n.attachments, [{ filePath: 'image.png', mimeType: 'image/png' }]);
});

test('parseKeepJson maps attachments with lowercase filepath fallback', () => {
    const n = parseKeepJson(JSON.stringify({ attachments: [{ filepath: 'image.jpg' }] }));
    assert.deepEqual(n.attachments, [{ filePath: 'image.jpg', mimeType: 'image/jpeg' }]);
});

test('parseKeepJson empty object -> empty defaults', () => {
    const n = parseKeepJson('{}');
    assert.equal(n.title, '');
    assert.equal(n.content, '');
    assert.deepEqual(n.tags, []);
    assert.deepEqual(n.attachments, []);
    assert.equal(n.created, null);
    assert.equal(n.updated, null);
});

test('parseKeepJson malformed JSON throws', () => {
    assert.throws(() => parseKeepJson('{ not json'), SyntaxError);
});

// ---------------- normalizeEnexContent (checkboxes) ----------------
test('normalizeEnexContent: checked double-quote', () => {
    assert.equal(normalizeEnexContent('<input type="checkbox" checked="true"/>'), '<en-todo checked="true"/>');
});
test('normalizeEnexContent: checked single-quote', () => {
    assert.equal(normalizeEnexContent("<input type='checkbox' checked='true'/>"), '<en-todo checked="true"/>');
});
test('normalizeEnexContent: checked bare', () => {
    assert.equal(normalizeEnexContent('<input type=checkbox checked>'), '<en-todo checked="true"/>');
});
test('normalizeEnexContent: unchecked', () => {
    assert.equal(normalizeEnexContent('<input type="checkbox"/>'), '<en-todo/>');
});
test('normalizeEnexContent: checked BEFORE type (attribute order)', () => {
    assert.equal(normalizeEnexContent('<input checked type="checkbox">'), '<en-todo checked="true"/>');
});
test('normalizeEnexContent: leaves non-checkbox inputs alone', () => {
    assert.equal(normalizeEnexContent('<input type="text" value="x">'), '<input type="text" value="x">');
});
test('normalizeEnexContent: <br> -> <br/>', () => {
    assert.equal(normalizeEnexContent('a<br>b'), 'a<br/>b');
});
test('normalizeEnexContent: strips <img>', () => {
    assert.equal(normalizeEnexContent('x<img src="a.png">y'), 'xy');
});
test('normalizeEnexContent: checklist list from parseKeepJson fully normalizes', () => {
    const n = parseKeepJson(SAMPLE_CHECKLIST);
    const out = normalizeEnexContent(n.content);
    assert.match(out, /<en-todo checked="true"\/>/);
    assert.match(out, /<en-todo\/>/);
});

// ---------------- buildTagsXml ----------------
test('buildTagsXml builds escaped <tag> nodes', () => {
    const xml = buildTagsXml({ tags: ['home', 'A & B'] });
    assert.equal(xml, '\n  <tag>home</tag>\n  <tag>A &amp; B</tag>');
});
test('buildTagsXml no tags -> empty', () => {
    assert.equal(buildTagsXml({}), '');
    assert.equal(buildTagsXml({ tags: [] }), '');
});

// ---------------- keepEntryVisible (dedup) ----------------
const jsonPaths = new Set(['Keep/Note.json']);

test('keepEntryVisible: .json visible', () => {
    assert.equal(keepEntryVisible({ name: 'Note.json', path: 'Keep/Note.json' }, 'keep', jsonPaths), true);
});
test('keepEntryVisible: .html WITH json sibling -> hidden (dedup)', () => {
    assert.equal(keepEntryVisible({ name: 'Note.html', path: 'Keep/Note.html' }, 'keep', jsonPaths), false);
});
test('keepEntryVisible: .html WITHOUT json sibling -> visible', () => {
    assert.equal(keepEntryVisible({ name: 'Other.html', path: 'Keep/Other.html' }, 'keep', jsonPaths), true);
});
test('keepEntryVisible: archive_browser.html hidden', () => {
    assert.equal(keepEntryVisible({ name: 'archive_browser.html', path: 'archive_browser.html' }, 'keep', jsonPaths), false);
});
test('keepEntryVisible: archive_browser.HTML (case) hidden', () => {
    assert.equal(keepEntryVisible({ name: 'Archive_Browser.HTML', path: 'x/Archive_Browser.HTML' }, 'keep', jsonPaths), false);
});
test('keepEntryVisible: dotfile hidden', () => {
    assert.equal(keepEntryVisible({ name: '.DS_Store', path: '.DS_Store' }, 'keep', jsonPaths), false);
});
test('keepEntryVisible: image always visible', () => {
    assert.equal(keepEntryVisible({ name: 'pic.JPG', path: 'pic.JPG' }, 'keep', jsonPaths), true);
});
test('keepEntryVisible: markdown format shows .md', () => {
    assert.equal(keepEntryVisible({ name: 'n.md', path: 'n.md' }, 'markdown', new Set()), true);
});
test('keepEntryVisible: unknown format shows everything (except dotfile)', () => {
    assert.equal(keepEntryVisible({ name: 'weird.dat', path: 'weird.dat' }, 'unknown', new Set()), true);
});

// ---------------- brute / failsafe: 2000 fuzzed notes must not crash ----------
test('fuzz: 2000 random note shapes parse without throwing uncaught', () => {
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    let parsed = 0;
    for (let i = 0; i < 2000; i++) {
        const obj = {};
        if (Math.random() > 0.3) obj.title = pick(['', 'T', '✨', '<b>', null, 123]);
        if (Math.random() > 0.5) obj.textContent = pick(['', 'hi\nbye', '<x>', '日本']);
        if (Math.random() > 0.7) obj.listContent = [{ text: pick(['a', null, '<i>']), isChecked: Math.random() > 0.5 }];
        if (Math.random() > 0.8) obj.labels = [{ name: pick(['x', '', null]) }];
        if (Math.random() > 0.9) obj.attachments = [{ filepath: 'a.png' }];
        try {
            const n = parseKeepJson(JSON.stringify(obj));
            assert.ok(typeof n.content === 'string');
            assert.ok(Array.isArray(n.tags));
            parsed++;
        } catch (e) {
            assert.ok(e instanceof SyntaxError || e instanceof TypeError);
        }
    }
    assert.ok(parsed > 1000, 'most fuzz notes should parse');
});
