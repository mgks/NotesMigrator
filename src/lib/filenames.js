// File name for one exported note. Keeps Unicode titles, drops only characters
// file systems reject, and adds " (2)", " (3)"... so no two notes share a name
// (a zip keeps only the last entry with a given name).
export function noteFilename(title, usedNames, ext = 'md') {
    const base = String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim() || 'note';
    let name = `${base}.${ext}`;
    for (let n = 2; usedNames.has(name.toLowerCase()); n++) {
        name = `${base} (${n}).${ext}`;
    }
    usedNames.add(name.toLowerCase());
    return name;
}
