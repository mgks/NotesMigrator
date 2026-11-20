import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteFilename } from '../src/lib/filenames.js';

test('noteFilename keeps every note when titles are empty, non-Latin or repeated', () => {
    const used = new Set();
    const names = ['', '', '会议记录', 'Ideas', 'ideas', 'Café', 'a/b: c?'].map(t => noteFilename(t, used));
    assert.deepEqual(names, [
        'note.md', 'note (2).md', '会议记录.md', 'Ideas.md', 'ideas (2).md', 'Café.md', 'ab c.md'
    ]);
});
