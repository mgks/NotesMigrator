// ENEX document generation.
//
// Lives in its own module (rather than inline in main.js) so the
// large-archive behaviour below is testable without a DOM — the
// `RangeError: Invalid string length` this guards against only shows up
// at sizes no manual click-through will reach.

import SparkMD5 from 'spark-md5';
import { Buffer } from 'buffer';
import { escapeXml, buildTagsXml, normalizeEnexContent } from './keep.js';

// Format a date as ENEX's compact basic-ISO timestamp (YYYYMMDDTHHMMSSZ).
export function toEnexDate(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

// Index binaryMap by basename so attachment lookup is O(1).
//
// The previous `Object.keys(binaryMap).find(k => k.endsWith(filename))`
// re-walked every key for every attachment — quadratic, and on a Keep
// archive with thousands of images that alone took longer than the rest
// of the export put together.
export function indexBinariesByName(binaryMap) {
    const byName = new Map();
    for (const key of Object.keys(binaryMap)) {
        const base = key.split('/').pop();
        // First key wins, matching the old `.find()` scan order.
        if (!byName.has(base)) byName.set(base, key);
    }
    return byName;
}

// Build an ENEX document as an ARRAY OF STRING CHUNKS, not one string.
//
// Concatenating the whole document into a single JS string throws
// `RangeError: Invalid string length` once it passes V8's maximum
// (~512 MB). ENEX inlines every image as base64, which inflates binary
// by 4/3, so a Keep archive with a few hundred MB of photos blows the
// cap and the export dies at the very last step — after all the parsing
// work is done.
//
// The Blob constructor takes an array of parts and concatenates them in
// the browser's backing store, which has no such limit. So we never
// materialise the document as a JS string; callers pass the array
// straight to `new Blob(parts)`. Peak memory also drops, since the
// old code held the fully-built string AND the next `+=` result at once.
//
// Synchronous on purpose: the per-source bundle path passes this
// function into buildSourceOutputs, which calls it without await.
// Making this async would return a Promise that gets stringified
// to "[object Promise]" inside the resulting Blob (caught by the
// UI smoke test). All work here is in-memory string + base64
// building, no I/O — no need for async.
export function generateEnexParts(notes, binaryMap) {
    const ts = new Date().toISOString().replace(/[-:.]/g, '').split('T')[0] + 'T' +
               new Date().toISOString().split('T')[1].replace(/[-:.]/g,'').slice(0,6) + 'Z';

    const binariesByName = indexBinariesByName(binaryMap);
    const parts = [];
    parts.push(`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export3.dtd">\n<en-export export-date="${ts}" application="NotesMigrator" version="1.0">`);
    for (const note of notes) {
        let content = note.content || '';
        // Resource chunks are collected separately and pushed after the
        // note body, since <resource> follows <content> in the schema.
        // Each base64 blob is its own chunk — they're the large ones.
        const resourceParts = [];

        if (note.attachments && note.attachments.length > 0) {
            for (const att of note.attachments) {
                const filename = att.filePath.split('/').pop();
                const binKey = binariesByName.get(filename);
                if (binKey) {
                    const arrayBuffer = binaryMap[binKey];
                    const spark = new SparkMD5.ArrayBuffer();
                    spark.append(arrayBuffer);
                    const hashHex = spark.end();
                    const base64 = Buffer.from(arrayBuffer).toString('base64');
                    
                    content += `<br/><br/><en-media type="${att.mimeType || 'image/jpeg'}" hash="${hashHex}" />`;

                    resourceParts.push(`
<resource>
  <data encoding="base64">`);
                    resourceParts.push(base64);
                    resourceParts.push(`</data>
  <mime>${att.mimeType || 'image/jpeg'}</mime>
  <resource-attributes><file-name>${filename}</file-name></resource-attributes>
</resource>`);
                }
            }
        }
        
        // Map checkbox inputs to Evernote <en-todo> items, escaping XML entities.
        content = normalizeEnexContent(content);
        
        const title = escapeXml(note.title || 'Untitled');

        // Preserve Keep labels as ENEX <tag> nodes, escaping XML entities.
        const tagsXml = buildTagsXml(note);
        
        const createdTs = toEnexDate(note.created) || ts;
        const updatedTs = toEnexDate(note.updated) || createdTs;

        parts.push(`
<note>
  <title>${title}</title>
  <content><![CDATA[<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>${content}</en-note>]]></content>
  <created>${createdTs}</created>
  <updated>${updatedTs}</updated>${tagsXml}
  `);
        for (const rp of resourceParts) parts.push(rp);
        parts.push(`
</note>`);
    }
    parts.push(`\n</en-export>`);
    return parts;
}
