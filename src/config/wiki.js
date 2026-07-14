// Shared Navigation HTML
const WIKI_NAV = `
    <div class="wiki-nav">
        <h4>See Also</h4>
        <br/>
        <div class="nav-links">
            <a href="/wiki/privacy/">Privacy Policy</a> &nbsp; <a href="https://github.com/mgks/NotesMigrator" target="_blank">Source Code</a>
        </div>
    </div>
`;

export const WIKI_PAGES = [
    {
        slug: 'privacy',
        title: 'Privacy Policy',
        desc: 'How Migrator handles your data securely.',
        content: `
            <div class="wiki-header">
                <h1>Privacy Policy</h1>
                <p class="intro">TL;DR: We cannot see your data.</p>
            </div>

            <section>
                <h3>1. Client-Side Processing</h3>
                <p>Migrator is designed as a "Local-First" application. All file parsing, conversion, and zip generation happens inside your web browser using JavaScript and Web Workers.</p>
            </section>

            <section>
                <h3>2. No Data Transfers</h3>
                <p>Your notes, files, and tokens <strong>never leave your device</strong>. We do not have a backend database to store them.</p>
            </section>

            <section>
                <h3>3. Analytics</h3>
                <p>We use Google Analytics to track <em>generic usage patterns</em> (e.g., "User converted Keep to Notion"). We explicitly disable data sharing and do not track any content within your notes.</p>
            </section>

            ${WIKI_NAV}
        `
    },
    {
        slug: 'guide',
        title: 'Export & Import Guide',
        desc: 'Step-by-step instructions for exporting notes from Google Keep, Notion, Evernote, and PDF.',
        content: `
            <div class="wiki-header">
                <h1>Migration Guide</h1>
                <p class="intro">How to get your data out of closed gardens.</p>
            </div>

            <section>
                <h3>Conversion Matrix</h3>
                <p>Every source × target the app supports, in one place:</p>
                <table class="matrix">
                    <thead>
                        <tr>
                            <th>From &darr; / To &rarr;</th>
                            <th>ENEX (Apple Notes / Evernote)</th>
                            <th>Markdown (Obsidian / Notion)</th>
                            <th>JSON</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>Google Keep</strong> (JSON / HTML)</td>
                            <td>&#10003;</td><td>&#10003;</td><td>&#10003;</td>
                        </tr>
                        <tr>
                            <td><strong>Notion</strong> (Markdown + CSV)</td>
                            <td>&#10003;</td><td>&#10003;</td><td>&mdash;</td>
                        </tr>
                        <tr>
                            <td><strong>Evernote</strong> (.enex)</td>
                            <td>&mdash;</td><td>&#10003;</td><td>&#10003;</td>
                        </tr>
                        <tr>
                            <td><strong>Markdown / Obsidian</strong></td>
                            <td>&#10003;</td><td>&mdash;</td><td>&mdash;</td>
                        </tr>
                        <tr>
                            <td><strong>JSON</strong> (raw)</td>
                            <td>&mdash;</td><td>&mdash;</td><td>&mdash;</td>
                        </tr>
                        <tr>
                            <td><strong>PDF</strong> (.pdf)</td>
                            <td>&#10003;</td><td>&#10003;</td><td>&#10003;</td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <section>
                <h3>Google Keep</h3>
                <ol>
                    <li>Go to <a href="https://takeout.google.com" target="_blank">Google Takeout</a>.</li>
                    <li>Click "Deselect all".</li>
                    <li>Scroll down and check <strong>Keep</strong>.</li>
                    <li>Click "Next step" &rarr; "Create export".</li>
                    <li>Download the <strong>.zip</strong> file.</li>
                </ol>
            </section>

            <section>
                <h3>Notion</h3>
                <ol>
                    <li>Open your Notion Workspace.</li>
                    <li>Go to <strong>Settings &amp; Members</strong> &rarr; <strong>Settings</strong>.</li>
                    <li>Scroll to "Export content" &rarr; "Export all workspace content".</li>
                    <li>Select format: <strong>Markdown &amp; CSV</strong>.</li>
                </ol>
            </section>

            <section>
                <h3>PDF Notes</h3>
                <ol>
                    <li>No export step needed — just drop your <strong>.pdf</strong> files into the upload area.</li>
                    <li>One note per file. Multi-page PDFs become a single note with one <code>&lt;h2&gt;Page N&lt;/h2&gt;</code> per page.</li>
                    <li>Text extraction runs entirely in your browser. PDFs stay on your device — no server upload.</li>
                    <li>For best results, use text-based PDFs. Scanned (image-only) PDFs need OCR first; try an external tool like OCRmyPDF, then re-import.</li>
                </ol>
            </section>

            <section>
                <h3>Apple Notes (Importing)</h3>
                <ol>
                    <li>Convert your files to <strong>Evernote (.enex)</strong> using this tool.</li>
                    <li>Open Apple Notes on Mac.</li>
                    <li>File &rarr; <strong>Import to Notes...</strong></li>
                    <li>Select the .enex file.</li>
                </ol>
            </section>

            ${WIKI_NAV}
        `
    }
];