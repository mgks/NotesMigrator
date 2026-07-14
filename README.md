<div align="center">

  <!-- PROJECT TITLE -->
  <h1>Migrator</h1>
  
  <!-- ONE LINE SUMMARY -->
  <p>
    <b>Migrate notes between Google Keep, Apple Notes, Evernote, and Notion.</b>
  </p>
  
  <!-- BADGES -->
  <p>
    <img src="https://img.shields.io/github/v/release/mgks/notesmigrator?style=flat-square&color=38bd24" alt="release version">
    <img src="https://img.shields.io/github/stars/mgks/notesmigrator?style=flat-square&logo=github&color=blue" alt="stars">
    <img src="https://img.shields.io/github/license/mgks/notesmigrator.svg?style=flat-square&color=blue" alt="license">
  </p>

  <!-- MENU -->
  <p>
    <h4>
      <a href="https://migrator.mgks.dev">🚀 Open Web App</a>
    </h4>
  </p>

  <!-- PREVIEW -->
  <p>
    <img width="800" alt="image" src="https://github.com/user-attachments/assets/fbfd6bc1-3616-4f32-816d-51dee8fcdb6b" />
  </p>

</div>

A free, secure, browser-based tool to migrate your notes between popular services like **Google Keep**, **Apple Notes**, **Evernote**, and **Notion**. Also extracts text from **PDF** notes and converts them to the format of your choice. All processing happens entirely in your browser, ensuring your notes remain private.

## Features

*   **Privacy First:** Runs **entirely in your browser**. Your notes are never uploaded to any server.
*   **Multi-Format Conversion:**
    *   **From:** Google Keep (`.html`, `._keep`), Evernote (`.enex`), Markdown (Notion / Obsidian exports), PDF (`.pdf`).
    *   **To:** Apple Notes (`.enex`), Evernote (`.enex`), Markdown (Obsidian / Notion compatible), JSON.
*   **Accurate Timestamps:** Creation and modification dates are preserved with a two-tier strategy — the note's own embedded date is used when available, falling back to the ZIP entry or file last-modified date. Notes will never falsely show today's date.
*   **Easy to Use:** A simple, modern interface with drag-and-drop, folder browsing, and automatic format detection.
*   **Intelligent UI:**
    *   Dynamic instructions guide you on how to export from your source application.
    *   Full recursive native folder drag-and-drop and button upload support to process nested notes alongside their attachments.
    *   Automatically selects relevant files within large Takeout archives, hiding background system configs.
*   **Resilient Parsing:** Unreadable or corrupted files within an archive are gracefully skipped rather than halting the entire conversion. A clear **toast notification** lists the filenames that were missed, and full details are available in the browser console.
*   **Rich User Feedback:** Typed toast notifications (info, success, warning, error) replace disruptive browser alerts, keeping the experience smooth and non-blocking.
*   **Handles a Wide Range of Content:**
    *   Note titles and content (HTML and Markdown).
    *   Creation / modification dates (best-effort parsing with file-date fallback).
    *   Checklists (checked and unchecked items).
    *   Tags and labels.
    *   Embedded and referenced images from exports.
*   **Apple Notes Image Support:** Images embedded in Google Keep exports are MD5-hashed and base64-encoded as `<resource>` tags in the ENEX output for seamless import into Apple Notes.
*   **PDF Text Extraction:** Drop a `.pdf` and NotesMigrator pulls the text out (one section per page) and hands it back to the same ENEX / Markdown / JSON pipeline. PDF support is loaded on demand, so users who only deal with Keep / Evernote don't pay the bandwidth.
*   **No Installation Required:** Works directly in modern web browsers (Chrome, Firefox, Safari, Edge).
*   **Dark / Light Mode:** Respects your system theme with a manual override toggle.

## How to Use

### Step 1: Choose Your Conversion Path

1.  Visit **[migrator.mgks.dev](https://migrator.mgks.dev/)**.
2.  Use the dropdown at the bottom to pick the format you want to convert **to**.
3.  The on-screen guide will update with export instructions for your source app.

### Step 2: Export Your Notes

*   **Google Keep:** Go to [Google Takeout](https://takeout.google.com/), deselect all, pick **Keep**, export, and download the `.zip`.
*   **Notion:** Settings → Export all workspace 
*   **PDF notes:** Just drop the `.pdf` files directly. Multi-page PDFs become one note with `<h2>Page N</h2>` per page; multi-file drops become multiple notes.content → **Markdown & CSV** → Download `.zip`.
*   **Evernote:** File → Export Notes → `.enex`.

### Step 3: Convert and Download

1.  Drag & drop the `.zip`, a folder, or individual files onto the upload area (or use the browse buttons).
2.  The tool scans, detects the format, and shows your notes in a checklist.
3.  Select the notes you want, pick an output format, then click **Download**.

### Step 4: Import into Destination

*   **Apple Notes (Mac):** Notes app → `File › Import to Notes…` → select the `.enex`.
*   **Apple Notes (iPhone/iPad):** AirDrop or save the `.enex` to Files → tap → Share → Notes.
*   **Obsidian:** Open the Markdown `.zip`, drop the extracted folder into your vault.

## Technology Stack

| Package | Purpose |
|---|---|
| [gkeep-parser](https://github.com/mgks/gkeep-parser) | Parse Google Keep Takeout HTML into structured JSON |
| [enex-io](https://github.com/mgks/enex-io) | Generate and parse Evernote / Apple Notes `.enex` files |
| [unpdf](https://github.com/unjs/unpdf) | Extract text from PDF notes (loaded on demand) |
| [md-fusion](https://github.com/mgks/md-fusion) | Convert notes between HTML/JSON and Markdown with YAML Frontmatter |
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