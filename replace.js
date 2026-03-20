const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(
`    // Update Global List
    const taggedEntries = entries.map(e => ({ ...e, sourceIndex }));
    state.allEntries = [...state.allEntries, ...taggedEntries];
    
    // Auto-Select New Files
    taggedEntries.forEach(e => state.selectedIds.add(\`\${sourceIndex}:\${e.path}\`));

    // Update Format Detection
    const allNames = state.allEntries.map(e => e.name);
    const primaryName = state.allEntries.length > 0 ? state.allEntries[0].name : 'unknown';
    state.detectedFormat = detectFormat(primaryName, allNames);`,
`    // Update Global List
    const taggedEntries = entries.map(e => ({ ...e, sourceIndex }));
    state.allEntries = [...state.allEntries, ...taggedEntries];
    
    // Update Format Detection
    const allNames = state.allEntries.map(e => e.name);
    const primaryName = state.allEntries.length > 0 ? state.allEntries[0].name : 'unknown';
    state.detectedFormat = detectFormat(primaryName, allNames);

    // Auto-Select ONLY Visible Files
    taggedEntries.forEach(e => {
        let isVisible = false;
        if (!e.name.startsWith('.')) {
            if (isImage(e.name)) isVisible = true;
            else if (state.detectedFormat === 'keep' && e.name.endsWith('.html')) isVisible = true;
            else if (state.detectedFormat === 'markdown' && e.name.endsWith('.md')) isVisible = true;
            else if (state.detectedFormat === 'enex' && e.name.endsWith('.enex')) isVisible = true;
            else if (state.detectedFormat === 'json' && e.name.endsWith('.json')) isVisible = true;
            else if (state.detectedFormat === 'unknown') isVisible = true;
        }
        if (isVisible) {
            state.selectedIds.add(\`\${sourceIndex}:\${e.path}\`);
        }
    });`
);

code = code.replace(
`    visibleEntries.forEach(e => {
        const id = \`\${e.sourceIndex}:\${e.path}\`;
        if (shouldSelect) state.selectedIds.add(id);
        else state.selectedIds.delete(id);
    });`,
`    if (shouldSelect) {
        visibleEntries.forEach(e => {
            const id = \`\${e.sourceIndex}:\${e.path}\`;
            state.selectedIds.add(id);
        });
    } else {
        state.selectedIds.clear();
    }`
);

fs.writeFileSync('src/main.js', code);
