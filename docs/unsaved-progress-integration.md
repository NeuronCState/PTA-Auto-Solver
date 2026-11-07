# beta.6 integration status

Hooks are wired: capture before job construction, mark only after an entire question applies successfully using its original answered state and generation token, render progress on task settlement, and reconcile after verified page Save. `tests/progress-pipeline.cjs` verifies the integrated path. Progress is not proof of saving and is separate from dirty-page/Save guards.

Original hook design notes:

# Unsaved question progress hooks

These hooks cover objective and fill question groups (route types 1–5). Programming pages retain their original progress behavior.

1. Call `captureInitialProgress()` before taking job snapshots or writing answers. Keep the returned token in the current page/run context. Calling again on the same page retains unsaved progress.
2. Capture whether each whole question was answered **before** writing (`selected(group)` for choice/judge; `inputs.every(input => input.value.trim())` for fill). A partially filled question is not complete. Keep all inputs of one question, not one job per blank.
3. Only after the entire job applies successfully, call `markQuestionWritten(problem, allQuestionInputs, wasAnswered, token)`. It verifies a selected choice/all nonempty blanks, rejects detached nodes/stale page tokens, and deduplicates using the question ID or R label (live node fallback). Existing answered questions can be rewritten but never increment the count.
4. Refresh the displayed progress with `setQuestionProgress(...)` after the hook. All concurrent callbacks share this synchronous tracker; repeated job completion calls cannot increment the same question twice.
5. After a successful save call `reconcileLocalProgress()` and refresh the UI. Sidebar catch-up is merged using the greater saved/local logical count, not added to it, so a saved question is not counted again. This is a progress hook only; do not use it as evidence that a save succeeded or as a dirty-state tracker.

No local storage is used. Reload reconstructs the tracker from the sidebar and discards unsaved increments. Changing exam/type/query page or the question total resets the tracker; a stop/restart on the same page does not. The solver's existing run/navigation guard must reject obsolete callbacks too, particularly navigation away and back without an intervening tracker read.

Tests: `node tests/unsaved-progress.cjs`, plus existing suites. Mocked DOM only; no live PTA submissions or model calls.
