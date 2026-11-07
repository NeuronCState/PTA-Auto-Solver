# beta.6 integration status

The navigation helper is integrated into `autoSolve`. It runs only after same-type navigation is exhausted, the current type has no remaining count, and no save/request/grading error has occurred. `runId`, URL, running state and continuous mode are checked at boundaries. See `tests/type-navigation.cjs` and `tests/runner.cjs`.

Original integration design notes:

# Type navigation integration

Helpers are isolated because the parallel concurrency work changes `autoSolve`.

In `autoSolve`, initialize `visitedTypes` once per run, seeded with the initial `typeRoute(location.href).id`. After each successful page, preserve existing run ID, running, URL and pageErrors guards. Never navigate after save failure, parse failure or unresolved grading.

Continue same-type question navigation first, preserving the existing full-score/skipped gating for code submissions. At the final page of a type, call `await goNextType(visitedTypes, runId)` only if continuous mode is still enabled. If it returns false, finish the run. If true, re-read `type = detectType()` and reset per-page counters before the next iteration. Do not use the old type after route navigation.

`goNextType` only clicks a later same-set type-summary link, skips empty/completed/visited types, never wraps, and waits for the expected route plus changed/stable problem DOM. Cancellation or unexpected navigation stops it. It does not visit overview or any submit-paper action. Existing single-question navigation should also guard URL changes against stale/manual navigation.

Evidence: the user's sanitized diagnostic has direct sidebar links `/problem-sets/.../exam/problems/type/1`, `/2`, `/4`, `/6`, `/7`, with labels and counts; numerous individual-number links share `/2`, so selection requires the type label/count rather than href alone. No live PTA execution was performed.
