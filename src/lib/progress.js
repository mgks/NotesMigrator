// Progress-overlay depth bookkeeping.
//
// The overlay is opened by nested pipeline steps (folder walk -> archive
// scan -> extract -> build), so it's reference-counted rather than a
// boolean: an inner step finishing must not tear down an outer step's
// spinner. The failure mode that costs the most is an *unbalanced* show
// — one `show` without its `hide` leaves the counter above zero and the
// overlay pinned open forever, with no error and no spinner movement.
// The user sees a hang; the pipeline has actually finished.
//
// Keeping the counter here, away from the DOM, is what lets that be
// tested. The caller supplies a `render` callback and owns all the
// element wrangling.

/**
 * @param {(s: {visible: boolean, label?: string, detail?: string, opts?: object}) => void} render
 */
export function createProgressController(render = () => {}) {
    let depth = 0;

    return {
        /** Open (or nest into) the overlay. Always pair with `hide`. */
        show(label, detail = '', opts = {}) {
            depth++;
            render({ visible: true, label, detail, opts });
            return depth;
        },

        /**
         * Update the text/percent of an already-open overlay. A no-op when
         * nothing is open — an update with no overlay means a step is
         * reporting after its own teardown, which is a bug worth seeing
         * rather than a reason to reopen the spinner.
         * @returns {boolean} whether the update was applied
         */
        update(label, detail = '', opts = {}) {
            if (depth === 0) return false;
            render({ visible: true, label, detail, opts });
            return true;
        },

        /**
         * Close one nesting level.
         * @returns {boolean} whether this closed the overlay outright
         */
        hide() {
            depth = Math.max(0, depth - 1);
            if (depth > 0) return false;
            render({ visible: false });
            return true;
        },

        /**
         * Force the overlay shut at a known-idle point.
         * @returns {number} levels that leaked — non-zero means some call
         *   site failed to balance its `show`, and is the signal to log.
         */
        settle() {
            const leaked = depth;
            depth = 0;
            render({ visible: false });
            return leaked;
        },

        depth: () => depth
    };
}
