# Local regression checks

Run `node tests/regressions.cjs` and `node --check 'PTA Auto Solver Pro-1.8.1-beta.1.user.js'`.

The VM tests exercise the production parser, wait loop, navigation loop and retry flow with deterministic mocks. They cover pending placeholder zero, legitimate terminal zero, partial scores, stale repeated results, timeout, skipped questions, missing-editor failure, continuous mode disabled, and visible judge feedback reaching the retry prompt.

These are not an authenticated PTA integration test. Current result discovery expects a visible role=dialog, ant-modal-content or modal-content container with 提交结果. Unrecognized layouts/status wording intentionally time out instead of guessing a score or resubmitting. “View last submission” is no longer automatically opened because it can show an older run. A fresh popup with no baseline cannot prove server submission identity; real PTA DOM and submission IDs still require verification. A terminal result identical to the previous result and with no observed pending state is conservatively rejected.

Visual QA is pending. Chromium could not launch in this executor (socket Operation not permitted), including an approved external attempt. The aura now follows its parent box, explicitly centers its children, waits for collapse before appearing, and no longer has two animations overwriting transform. Test repeated expand/collapse, resizing, both themes, and running/stopped states in a real browser before release.

No hidden judge inputs are obtained or invented. Only visible result text (up to 8,000 characters) is supplied to the retry prompt. No automatic PTA submissions or model API requests were made by these tests.

Single-question mode now stops after the first eligible question group on the current page for choice, multiple-choice, judge, fill and program-fill types; all blanks belonging to that one question are filled together. Previously the checkbox only controlled changing pages, so an entire page was always processed. The checkbox is checked after each attempted question, so turning it off during a model request takes effect before the next question. Already answered groups skipped by the skip setting do not consume the single-question attempt. The UI label is now 连续答题.
