const p=`
  * { box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    margin: 0;
    padding: 32px;
    color: #111;
    background: #fff;
    font-size: 14px;
    line-height: 1.55;
  }
  .meta { color: #555; font-size: 12px; margin-bottom: 4px; }
  h1.title { font-size: 22px; margin: 0 0 4px; line-height: 1.2; page-break-after: avoid; }
  .note { border-top: 1px solid #ddd; padding: 24px 0 32px; page-break-inside: avoid; }
  .note:first-child { border-top: 0; padding-top: 0; }
  .tags { color: #888; font-size: 11px; margin-top: 8px; }
  .actions { margin-top: 32px; padding: 16px; background: #f3f4f6; border-radius: 6px; font-size: 13px; }
  a { color: #2563eb; text-decoration: none; }
  img { max-width: 100%; }
  pre { background: #f3f4f6; padding: 12px; border-radius: 6px; overflow-x: auto; }
  code { font-family: 'Fira Code', Consolas, monospace; font-size: 12px; }
  @page { margin: 18mm 14mm; }
  @media print {
    body { padding: 0; }
    .actions { display: none; }
  }
`;function a(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function s(t){if(!t)return"";try{return new Date(t).toISOString().replace("T"," ").slice(0,16)+" UTC"}catch{return String(t)}}function l(t,e){const r=a(t.title||`Untitled ${e+1}`),n=s(t.created),o=s(t.updated),i=Array.isArray(t.tags)&&t.tags.length?`<div class="tags">tags: ${t.tags.map(a).join(", ")}</div>`:"";return`
    <article class="note">
      <div class="meta">${n?`created ${n}`:""}${n&&o?" · ":""}${o&&o!==n?`updated ${o}`:""}</div>
      <h1 class="title">${r}</h1>
      <div class="content">${t.content||""}</div>
      ${i}
    </article>
  `}function g(t,e={}){const{title:r="NotesMigrator export",appUrl:n="https://migrator.mgks.dev"}=e,o=new Date().toISOString().replace("T"," ").slice(0,16)+" UTC",i=t.map((d,c)=>l(d,c)).join(`
`);return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${a(r)}</title>
  <style>${p}</style>
</head>
<body>
  <h1 style="margin: 0 0 4px; font-size: 24px;">${a(r)}</h1>
  <div class="meta">Exported ${o} · ${t.length} note${t.length===1?"":"s"} · <a href="${a(n)}">migrator.mgks.dev</a></div>
  <div class="actions">In the browser's print dialog, choose <strong>Save as PDF</strong> as the destination to keep the formatted version on your device. The conversion runs entirely on your machine — your notes are never uploaded.</div>
  ${i}
</body>
</html>`}function m(t){const e=window.open("about:blank","_blank");return e?(e.document.open(),e.document.write(t),e.document.close(),setTimeout(()=>{try{e.focus(),e.print()}catch{}},250),e):null}export{g as notesToPrintableHTML,m as openPrintWindow};
