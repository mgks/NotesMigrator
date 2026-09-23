// Pipeline instrumentation.
//
// The import path (drop -> scan -> extract -> parse -> build) hands work
// off to a Worker and to JSZip, both of which can sit for a long time
// inside a single opaque `await`. When that happens the progress overlay
// keeps spinning with no way to tell "still working on a 400 MB zip"
// apart from "the worker died and nothing is ever coming back".
//
// This module records a timestamped event per pipeline step into a ring
// buffer, and runs a watchdog that fires when no event has landed for a
// while. Nothing here touches the DOM or the network; the app wires the
// stall callback to a toast, and the buffer is exposed on
// `window.__migrator` so a stalled run can be inspected from devtools
// after the fact.

const MAX_EVENTS = 500;

// Default: how long a single step may go silent before we call it stalled.
// JSZip.loadAsync on a large Takeout archive is the slowest legitimate
// step and lands well under this on a cold cache.
export const DEFAULT_STALL_MS = 15000;

const events = [];
let startedAt = null;
let seq = 0;

// Watchdog state. `armedPhase` is non-null only while a step is in
// flight, so an idle app never reports a stall.
let armedPhase = null;
let armedAt = 0;
let timer = null;
let stallMs = DEFAULT_STALL_MS;
let onStall = null;
let stallReported = false;

function now() {
    return (typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now();
}

/**
 * Record one pipeline event.
 * @param {string} phase  Coarse step name, e.g. 'scan' or 'extract'.
 * @param {string} detail Human-readable specifics, e.g. the file name.
 * @param {object} meta   Structured extras (counts, sizes, indices).
 */
export function mark(phase, detail = '', meta = {}) {
    const t = now();
    if (startedAt === null) startedAt = t;
    const evt = {
        seq: seq++,
        phase,
        detail,
        meta,
        t,
        elapsed: Math.round(t - startedAt)
    };
    events.push(evt);
    if (events.length > MAX_EVENTS) events.shift();

    // Any event counts as proof of life for the armed step — except the
    // watchdog's own 'stall' record, which would otherwise reset the
    // silence clock and re-fire the warning every `stallMs`.
    if (armedPhase !== null && phase !== 'stall') {
        armedAt = t;
        stallReported = false;
    }
    return evt;
}

/** Record a failure. Kept distinct from `mark` so `failures()` can filter. */
export function fail(phase, err, meta = {}) {
    return mark(phase, err && err.message ? err.message : String(err), {
        ...meta,
        error: true,
        stack: err && err.stack ? err.stack : undefined
    });
}

/**
 * Arm the watchdog for a step. Call on entry to anything that hands off
 * to a worker or a long await; call `disarm` when it comes back.
 */
export function arm(phase, ms = stallMs) {
    armedPhase = phase;
    armedAt = now();
    stallMs = ms;
    stallReported = false;
    if (timer === null && typeof setInterval === 'function') {
        timer = setInterval(tick, 1000);
        // Don't hold a Node process open on account of the watchdog.
        if (timer && typeof timer.unref === 'function') timer.unref();
    }
}

export function disarm() {
    armedPhase = null;
    stallReported = false;
    if (timer !== null && typeof clearInterval === 'function') {
        clearInterval(timer);
        timer = null;
    }
}

// Exported for tests: advance the watchdog without waiting on a real timer.
export function tick(at = now()) {
    if (armedPhase === null || stallReported) return null;
    const silent = at - armedAt;
    if (silent < stallMs) return null;
    stallReported = true;   // report once per stall, not once per second
    const info = { phase: armedPhase, silentMs: Math.round(silent) };
    // Recorded via mark so it lands in the timeline next to the step that
    // went quiet; mark() ignores it for watchdog-feeding purposes.
    mark('stall', `${armedPhase} — no progress for ${Math.round(silent / 1000)}s`, info);
    if (typeof onStall === 'function') {
        try { onStall(info); } catch { /* a bad callback must not kill the pipeline */ }
    }
    return info;
}

/** Register the stall callback (the app wires this to a toast). */
export function onStalled(fn) { onStall = fn; }

/** Snapshot of the ring buffer. */
export function timeline() { return events.slice(); }

/** Only the events recorded via `fail`, plus watchdog stalls. */
export function failures() {
    return events.filter(e => e.meta && (e.meta.error || e.phase === 'stall'));
}

export function reset() {
    events.length = 0;
    startedAt = null;
    seq = 0;
    disarm();
}

/** Console-friendly dump, for pasting into a bug report. */
export function dump() {
    return events
        .map(e => `${String(e.elapsed).padStart(7)}ms  ${e.phase.padEnd(16)} ${e.detail}`)
        .join('\n');
}
