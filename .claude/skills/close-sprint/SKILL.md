---
name: close-sprint
description: Close a PileScan sprint as team lead - collect final status, update docs and rules, rewrite the handoff as a short snapshot, shut the team down and report.
disable-model-invocation: true
argument-hint: "[sprint-number]"
---

# Close sprint $ARGUMENTS

You are `team-lead`. Do every step; if one fails, say so in the final report instead of
skipping it silently.

## 1. Collect
- Ask every running teammate to commit its work and send: what it did (commits), current
  state, open issues, next steps, and any **durable** lesson learned.
- For a teammate that already stopped, use `git log` and its last messages.
- Check `git log` before re-asking: answers often cross with your request.

## 2. Verify
- `git status` is clean, apart from git-ignored files.
- The QA report `tests/report-sprint$ARGUMENTS.md` exists. Note anything not verified.

## 3. Update the committed docs
- `docs/build-summary.md`: a section for this sprint (goal, fixed, added, numbers, still open).
- ADR status and links for decisions made this sprint. `README.md` if commands changed.
- Mark the sprint file `docs/sprints/sprint-$ARGUMENTS.md` as done.

## 4. Durable lessons → `.claude/rules/`
For each lesson, ask: "will this still be true next sprint?"
- Yes: add one line to the matching rule file (`backend.md`, `frontend.md`, `inference.md`,
  `tests-and-eval.md`, `api-contracts.md`, `team-workflow.md`). Remove or fix lines that are
  no longer true. Keep each file short.
- No: it belongs in the handoff, not in the rules.

## 5. Rewrite the handoff (never append)
- Move the current files to `.claude/handoff/archive/<YYYY-MM-DD>-sprint$ARGUMENTS/`.
- Write new files with **only the current state**:
  - `README.md` (at most ~60 lines): overall status, latest numbers, open issues in priority
    order, machine notes, reserved work, suggested next sprint.
  - One file per role (`lead.md`, `frontend.md`, `backend.md`, `vision.md`, `qa.md`, at most
    ~30 lines each): State, Open, Next. Commands only if they aren't in the service README.
- Nothing that is already fixed. Nothing that is already in the rules or a README.

## 6. Commit and shut down
- Commit docs and rules with explicit paths (`docs: close sprint $ARGUMENTS`). The handoff is
  git-ignored; don't force-add it.
- Ask each teammate to shut down and confirm none is still running.

## 7. Report to the human
What shipped, the key numbers, what is still open, what wasn't verified, and the final commit
hash. Remind them: `/exit`, check `tmux ls`, and `docker compose down` (without `-v`).
