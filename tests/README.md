# Local regression checks

Run `node tests/regressions.cjs` and `node --check 'PTA Auto Solver Pro-1.8.1-beta.1.user.js'`.

The VM tests exercise the production parser, wait loop, navigation loop and retry flow with deterministic mocks. They cover pending placeholder zero, legitimate terminal zero, partial scores, stale repeated results, timeout, skipped questions, missing-editor failure, continuous mode disabled, and visible judge feedback reaching the retry prompt.

These are not an authenticated PTA integration test. Result discovery supports visible role=dialog, ant-modal-content, modal-content and current PTA pc-modal-container containers with 提交结果. Beta.4 adds the current PTA selector confirmed in a diagnostic capture showing a pending result followed by 10/10 and two 5/5 test points. Sanitized node mocks cover discovery, hidden/unrelated containers, pending-to-final parsing, checkpoint feedback and the confirmation button. These selector mocks are not a browser layout test. Unrecognized layouts/status wording intentionally time out instead of guessing a score or resubmitting. “View last submission” is no longer automatically opened because it can show an older run. A fresh popup with no baseline cannot prove server submission identity; real PTA DOM and submission IDs still require verification. A terminal result identical to the previous result and with no observed pending state is conservatively rejected.

Visual QA is pending. Chromium could not launch in this executor (socket Operation not permitted), including an approved external attempt. The aura now follows its parent box, explicitly centers its children, waits for collapse before appearing, and no longer has two animations overwriting transform. Test repeated expand/collapse, resizing, both themes, and running/stopped states in a real browser before release.

No hidden judge inputs are obtained or invented. Only visible result text (up to 8,000 characters) is supplied to the retry prompt. No automatic PTA submissions or model API requests were made by these tests.

Single-question mode now stops after the first eligible question group on the current page for choice, multiple-choice, judge, fill and program-fill types; all blanks belonging to that one question are filled together. Previously the checkbox only controlled changing pages, so an entire page was always processed. The checkbox is checked after each attempted question, so turning it off during a model request takes effect before the next question. Already answered groups skipped by the skip setting do not consume the single-question attempt. The UI label is now 连续答题.

Diagnostics: `node tests/diagnostics.cjs` tests default-off, URL/token filtering, host restriction, mutation scheduling throttle, count/byte limits, stop cleanup, and absence of network/storage calls. These are mocked unit checks, not full browser DOM sanitization assurance. Real authenticated PTA capture/export UI and redaction must be verified before sharing captured data.

Beta.3 diagnostics tests additionally cover pending text becoming a graded result before the throttle fires, retaining final results after 30 changes, byte-budget eviction, duplicate snapshots, and a final capture at the time cutoff.

Beta.5 additionally tests preserving read-only CodeMirror question code from the live document, excluding writable answers, literal B-to-B mapping, rejecting explanatory text instead of harvesting A-F from words, and explicit multiple-choice letters. These are VM mocks, not a recorded model request or real page click.

Run `node tests/progress-language.cjs` for current-type progress counters (including conflicting sidebar totals, both fill routes, and ID-based navigation), JAVA course-title detection, JavaScript exclusion, code evidence, and manual-language precedence. These are sanitized mock regressions rather than authenticated end-to-end tests.
