// Tests for the progress-overlay depth counter.
//
// Regression cover for the drag-and-drop stall: handleDrop opened a
// "Reading folder" overlay and only released it on the empty-drop path,
// so every successful drop left the counter at 1. The scan finished, the
// pipeline went idle, and the overlay stayed up reading "Scanning
// archive" forever.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProgressController } from '../src/lib/progress.js';

// Records every render call so a test can assert on the painted state.
function harness() {
    const frames = [];
    const ctl = createProgressController(s => frames.push(s));
    return {
        ctl,
        frames,
        visible: () => (frames.length ? frames.at(-1).visible : false),
        last: () => frames.at(-1)
    };
}

test('show opens the overlay with label and detail', () => {
    const h = harness();
    h.ctl.show('Scanning archive', 'keep.zip');
    assert.equal(h.visible(), true);
    assert.equal(h.last().label, 'Scanning archive');
    assert.equal(h.last().detail, 'keep.zip');
    assert.equal(h.ctl.depth(), 1);
});

test('a balanced show/hide closes the overlay', () => {
    const h = harness();
    h.ctl.show('Scanning archive');
    assert.equal(h.ctl.hide(), true);
    assert.equal(h.visible(), false);
    assert.equal(h.ctl.depth(), 0);
});

test('nested steps keep the overlay up until the outermost finishes', () => {
    const h = harness();
    h.ctl.show('Reading folder');
    h.ctl.show('Scanning archive');
    assert.equal(h.ctl.hide(), false, 'inner hide must not close the overlay');
    assert.equal(h.visible(), true);
    assert.equal(h.ctl.hide(), true);
    assert.equal(h.visible(), false);
});

test('an unbalanced show leaves the overlay pinned open', () => {
    // The exact shape of the reported stall: two shows, one hide.
    const h = harness();
    h.ctl.show('Reading folder');     // folder walk — never released
    h.ctl.show('Scanning archive');
    h.ctl.hide();                     // scan_complete
    assert.equal(h.visible(), true, 'this is the bug the guard exists to catch');
    assert.equal(h.ctl.depth(), 1);
});

test('settle force-closes a leaked overlay and reports the depth', () => {
    const h = harness();
    h.ctl.show('Reading folder');
    h.ctl.show('Scanning archive');
    h.ctl.hide();
    assert.equal(h.ctl.settle(), 1, 'must report the leaked level');
    assert.equal(h.visible(), false);
    assert.equal(h.ctl.depth(), 0);
});

test('settle reports zero when every show was balanced', () => {
    const h = harness();
    h.ctl.show('Scanning archive');
    h.ctl.hide();
    assert.equal(h.ctl.settle(), 0);
});

test('hide never drives the counter negative', () => {
    const h = harness();
    h.ctl.hide();
    h.ctl.hide();
    assert.equal(h.ctl.depth(), 0);
    // A later show must still open: an underflow would otherwise make the
    // overlay un-openable for the rest of the session.
    h.ctl.show('Scanning archive');
    assert.equal(h.visible(), true);
});

test('update is ignored when no overlay is open', () => {
    const h = harness();
    assert.equal(h.ctl.update('Extracting', '1 / 10'), false);
    assert.equal(h.frames.length, 0, 'must not paint, and must not reopen');
});

test('update repaints an open overlay', () => {
    const h = harness();
    h.ctl.show('Extracting', 'starting');
    assert.equal(h.ctl.update('Extracting', '5 / 10', { percent: 50 }), true);
    assert.equal(h.last().detail, '5 / 10');
    assert.equal(h.last().opts.percent, 50);
});

test('a detail-only update passes a null label through', () => {
    // Worker heartbeats move the detail line without renaming the phase.
    const h = harness();
    h.ctl.show('Scanning archive', 'keep.zip');
    h.ctl.update(null, 'Listing notes — 500 files scanned');
    assert.equal(h.last().label, null);
    assert.equal(h.last().detail, 'Listing notes — 500 files scanned');
});

test('update does not change nesting depth', () => {
    const h = harness();
    h.ctl.show('Scanning archive');
    h.ctl.update('Scanning archive', 'still going');
    assert.equal(h.ctl.depth(), 1);
});

test('controller works without a render callback', () => {
    const ctl = createProgressController();
    assert.doesNotThrow(() => { ctl.show('x'); ctl.update('x', 'y'); ctl.hide(); });
});
