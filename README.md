<div align="center">

  <h1>Migrator</h1>
  <p>
    <b>Migrate notes between Google Keep, Apple Notes, Evernote, Notion, Markdown, and PDF.</b>
  </p>
  <p>
    <img src="https://img.shields.io/github/v/release/mgks/notesmigrator?style=flat-square&color=38bd24" alt="release version">
    <img src="https://img.shields.io/github/stars/mgks/notesmigrator?style=flat-square&logo=github&color=blue" alt="stars">
    <img src="https://img.shields.io/github/license/mgks/notesmigrator.svg?style=flat-square&color=blue" alt="license">
  </p>
  <p>
    <h4>
      <a href="https://migrator.mgks.dev">🚀 Open Web App</a>
    </h4>
  </p>
  <p>
    <img width="800" alt="Notes Migrator screenshot" src="https://github.com/user-attachments/assets/fbfd6bc1-3616-4f32-816d-51dee8fcdb6b" />
  </p>

</div>

A free, secure, browser-based tool to migrate your notes between popular services like **Google Keep**, **Apple Notes**, **Evernote**, and **Notion**. Also extracts text from **PDF** notes and converts them to the format of your choice. All processing happens entirely in your browser, ensuring your notes remain private.

## Conversion matrix

Every supported source × target, in one place:

| From ↓ / To →   | **ENEX (Apple Notes / Evernote)** | **Markdown (Obsidian / Notion)** | **JSON** |
| ---            | --- | --- | --- |
| **Google Keep JSON / HTML** | ✓ | ✓ | ✓ |
| **Notion (Markdown + CSV)** | ✓ | ✓ | — |
| **Evernote (.enex)** | — | ✓ | ✓ |
| **Markdown / Obsidian** | ✓ | — | — |
| **JSON (raw)** | — | — | — |
| **PDF (.pdf)** | ✓ | ✓ | ✓ |

## Features

*   **Privacy first.** Runs entirely in your browser. Files are never uploaded to any server.
*   **Six source formats, three output formats.** See the matrix above.
*   **Accurate timestamps.** The note's own embedded date is used when available; falls back to the source file's last-modified date.
*   **Drag-and-drop everything.** Zips, folders, individual files. Recursive folder support; the tool picks the right files inside a Takeout archive automatically.
*   **Resilient parsing.** Unreadable or corrupted files are skipped with a clear toast notification; the run doesn't fail.
*   **Apple Notes image support.** Keep images are MD5-hashed and embedded as `<resource>` tags in the ENEX output.
*   **PDF text extraction.** Drop a `.pdf`; multi-page documents become one note with `<h2>Page N</h2>` per page. The 1.6 MB PDF parser is loaded on demand.
*   **No installation.** Chrome, Firefox, Safari, Edge. PWA-installable.
*   **Dark / light theme.** Respects your system preference with a manual override.

## How to Use

### 1. Pick the format you want to convert to

Visit [migrator.mgks.dev](https://migrator.mgks.dev/) and choose the output format from the bottom dropdown. The on-screen guide updates with the export steps for your source app.

### 2. Export and drop

*   **Google Keep:** [Google Takeout](https://takeout.google.com/) → deselect all → tick **Keep** → export → download the `.zip`.
*   **Notion:** Settings → Export all workspace content → **Markdown & CSV** → download.
*   **Evernote:** File → Export Notes → `.enex`.
*   **Markdown / Obsidian vault:** drag the folder or zip straight in.
*   **PDF notes:** just drop the `.pdf` files. Multi-page PDFs become one note with `<h2>Page N</h2>` per page; multi-file drops become multiple notes.

### 3. Convert and download

Drop your files in the upload area. The tool scans, detects the format, and shows your notes in a checklist. Select the ones you want, then click **Download**.

### 4. Import at the destination

*   **Apple Notes (Mac):** File → Import to Notes → pick the `.enex`.
*   **Apple Notes (iOS):** AirDrop or save the `.enex` to Files → tap → Share → Notes.
*   **Obsidian:** open the Markdown `.zip`, drop the extracted folder into your vault.

## Technology Stack

| Package | Purpose |
|---|---|
| [gkeep-parser](https://github.com/mgks/gkeep-parser) | Parse Google Keep Takeout HTML into structured JSON |
| [enex-io](https://github.com/mgks/enex-io) | Generate and parse Evernote / Apple Notes `.enex` files |
| [md-fusion](https://github.com/mgks/md-fusion) | Convert between HTML/JSON and Markdown with YAML Frontmatter |
| [unpdf](https://github.com/unjs/unpdf) | Extract text from PDF notes (loaded on demand) |
| [JSZip](https://stuk.github.io/jszip/) | Read and write `.zip` archives in-browser |
| [SparkMD5](https://github.com/satazor/js-spark-md5) | MD5 hashes required for Evernote image resources |
| [Day.js](https://day.js.org/) | Date parsing and formatting |
| [Vite](https://vitejs.dev/) + PWA | Build toolchain and offline support |

## Privacy

All processing happens locally in your browser. Files are never uploaded to any server. Anonymous, aggregate Google Analytics is used solely to understand which conversion paths are most popular — no personal data or note content is collected.

## Contributing

Contributions are welcome! Please open an issue or pull request on [GitHub](https://github.com/mgks/NotesMigrator).

## License

MIT

> **{ github.com/mgks }**
> 
> ![Website Badge](https://img.shields.io/badge/Visit-mgks.dev-blue?style=flat&link=https%3A%2F%2Fmgks.dev) ![Sponsor Badge](https://img.shields.io/badge/%20%20Become%20a%20Sponsor%20%20-red?style=flat&logo=github&link=https%3A%2F%2Fgithub.com%2Fsponsors%2Fmgks)
