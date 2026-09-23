// Tests for the pipeline tracer used to debug import stalls.
//
// The watchdog is what turns "the app hangs on import" into a named
// step, so its arm/feed/fire/disarm logic is worth pinning down. `tick`
// takes an explicit timestamp so these run without real timers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as trace from '../src/lib/trace.js';

const later = (ms) => performance.now() + ms;

test('mark records phase, detail and ordering', () => {
    trace.reset();
    trace.mark('scan', 'keep.zip', { bytes: 10 });
    trace.mark('extract', 'note.html');
    const tl = trace.timeline();
    assert.equal(tl.length, 2);
    assert.equal(tl[0].phase, 'scan');
    assert.equal(tl[0].detail, 'keep.zip');
    assert.equal(tl[0].meta.bytes, 10);
    assert.ok(tl[1].seq > tl[0].seq);
    assert.ok(tl[0].elapsed >= 0);
});

test('watchdog stays quiet while disarmed', () => {
    trace.reset();
    trace.mark('scan', 'x');
    assert.equal(trace.tick(later(60000)), null);
});

test('watchdog stays quiet before the stall threshold', () => {
    trace.reset();
    trace.arm('scan', 15000);
    assert.equal(trace.tick(later(5000)), null);
});

test('watchdog fires once the step goes silent', () => {
    trace.reset();
    trace.arm('scan', 15000);
    const stall = trace.tick(later(20000));
    assert.ok(stall, 'expected a stall report');
    assert.equal(stall.phase, 'scan');
    assert.ok(stall.silentMs >= 15000);
    trace.disarm();
});

test('a stall is reported once, not once per tick', () => {
    trace.reset();
    trace.arm('scan', 15000);
    assert.ok(trace.tick(later(20000)));
    assert.equal(trace.tick(later(25000)), null, 'second tick must not re-report');
    trace.disarm();
});

test('a worker heartbeat feeds the watchdog', () => {
    trace.reset();
    trace.arm('extract', 15000);
    trace.mark('extract:progress', 'Extracting 12 / 400');  // heartbeat resets the clock
    assert.equal(trace.tick(later(5000)), null);
    trace.disarm();
});

test('disarm stops the watchdog mid-step', () => {
    trace.reset();
    trace.arm('scan', 15000);
    trace.disarm();
    assert.equal(trace.tick(later(60000)), null);
});

test('stall callback receives the phase', () => {
    trace.reset();
    let got = null;
    trace.onStalled(info => { got = info; });
    trace.arm('extract', 1000);
    trace.tick(later(5000));
    assert.equal(got.phase, 'extract');
    trace.onStalled(null);
    trace.disarm();
});

test('a throwing stall callback does not break the tracer', () => {
    trace.reset();
    trace.onStalled(() => { throw new Error('bad listener'); });
    trace.arm('scan', 1000);
    assert.doesNotThrow(() => trace.tick(later(5000)));
    trace.onStalled(null);
    trace.disarm();
});

test('failures collects errors and stalls, not ordinary marks', () => {
    trace.reset();
    trace.mark('scan', 'fine');
    trace.fail('extract', new Error('bad zip'));
    trace.arm('scan', 1000);
    trace.tick(later(5000));
    const f = trace.failures();
    assert.equal(f.length, 2);
    assert.ok(f.some(e => e.detail === 'bad zip'));
    assert.ok(f.some(e => e.phase === 'stall'));
    trace.disarm();
});

test('fail captures message and stack', () => {
    trace.reset();
    trace.fail('worker', new Error('boom'));
    const e = trace.timeline()[0];
    assert.equal(e.detail, 'boom');
    assert.equal(e.meta.error, true);
    assert.ok(e.meta.stack.includes('Error: boom'));
});

test('fail tolerates a non-Error throw', () => {
    trace.reset();
    trace.fail('worker', 'string failure');
    assert.equal(trace.timeline()[0].detail, 'string failure');
});

test('ring buffer is bounded', () => {
    trace.reset();
    for (let i = 0; i < 700; i++) trace.mark('x', String(i));
    const tl = trace.timeline();
    assert.equal(tl.length, 500);
    assert.equal(tl.at(-1).detail, '699', 'must keep the most recent events');
});

test('dump renders one aligned line per event', () => {
    trace.reset();
    trace.mark('scan', 'keep.zip');
    trace.mark('extract', 'note.html');
    const lines = trace.dump().split('\n');
    assert.equal(lines.length, 2);
    assert.match(lines[0], /ms\s+scan\s+keep\.zip/);
});

test('reset clears the buffer and disarms', () => {
    trace.reset();
    trace.arm('scan', 1000);
    trace.mark('scan', 'x');
    trace.reset();
    assert.equal(trace.timeline().length, 0);
    assert.equal(trace.tick(later(60000)), null, 'reset must disarm the watchdog');
});
