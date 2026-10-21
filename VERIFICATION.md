# Bootstrap release verification

- 27 automated tests passed with Node.js: turn order, selection probabilities, stage boundaries, 2/3/4/8/20-player targeting, duplicate avoidance, configurable categories, exhaustion, invalid configuration, saved-state validation, storage failures, encryption, incorrect phrases, authenticated metadata, early-opening rejection, and capsule import validation.
- `npm run check` passed: JSON configuration and questions accepted by the runtime validators; all local HTML and module references exist and stay relative; JavaScript syntax passes; `.nojekyll` is present; application code uses no dynamic HTML injection or code evaluation.
- The local Bootstrap CSS and JavaScript match the official Bootstrap 5.3.8 SHA-384 integrity values. The bundle passes a JavaScript syntax check and its MIT license is included.
- The game engine, JSON configuration, all original/additional question data, storage format and encryption module are byte-for-byte identical to the preceding release.
- Both HTML files were parsed for duplicate IDs and broken static labels.
- All 204 `originalText` values were independently reconciled against normalized text extracted from the supplied PDF. Two explicitly marked editorial comments are omitted from the displayed text, with the complete normalized wording preserved.
- The probability table on page 1 of the PDF was visually reviewed against the configuration.

## Verification limits

A browser preview/control capability was not available in this environment. No live browser, responsive screenshot, accessibility engine, GitHub Pages deployment, or actual mobile-device check was performed. Automated checks do not substitute for these checks.

The JSON Schema files were parsed as JSON. Runtime structure and cross-field validation passed; a separate JSON Schema validation library was not available.

## First publication checklist

1. On desktop and mobile, verify that the home screen and all three deck choices fit without horizontal scrolling.
2. Add, reorder and remove players; start games with 2 and 4 people.
3. Pass a card, advance the turn, add an optional responder, pause, reload and resume.
4. Open the rules and searchable card catalogue. Confirm that additions are disabled by default and labelled separately.
5. In a local copy with `closure.delayDays` set to 0, create a capsule. Export it, delete its local copy, import it, and open both answers with their respective phrases. The production default remains 5 days.
6. Test the final GitHub Pages URL, not only localhost. Check that `config.json` and both question files load under the repository path.

The custom frontend has been replaced with standard Bootstrap components. No site has been published as part of this handover. The included files are ready to upload to the requested static host.
