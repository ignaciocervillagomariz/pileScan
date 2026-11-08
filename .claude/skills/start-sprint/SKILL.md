---
name: start-sprint
description: Start a PileScan sprint as team lead - read the handoff, prepare the sprint file, spawn the teammates from the role definitions and run the plan-approval protocol.
disable-model-invocation: true
argument-hint: "[sprint-number]"
---

# Start sprint $ARGUMENTS

You are `team-lead`. Follow these steps in order and stop where a step says so.

## 1. Load the state
- Read `.claude/handoff/README.md` and every role file in `.claude/handoff/`.
- Run `git status` and `git log --oneline -10`. If the tree isn't clean, stop and ask the
  human what to do.

## 2. The sprint file
- Open `docs/sprints/sprint-$ARGUMENTS.md`.
- If it doesn't exist, create it from `sprint-template.md` (in this skill's folder), filled in
  from the handoff's "Suggested next sprint". Show it to the human and **stop until they
  approve it**.
- Check it is buildable: every task has an owner and acceptance criteria, no task touches
  reserved work (rarity-weighted ranking, `/training`), and no two roles own the same files.
- Does this sprint even need a team? If almost all the work is in one directory or is
  sequential, say so and suggest a single session instead.

## 3. Prepare
- If ownership changes, update the ownership table and "Team" section in `CLAUDE.md`.
- If the sprint needs contract changes, make them **now** with `/change-contract`, before
  anyone writes code.
- Commit these docs (`docs: start sprint $ARGUMENTS`), staging explicit paths.

## 4. Spawn the team
- Spawn one teammate per role in the sprint file, using its agent type and these exact names:
  `frontend` (frontend-dev), `backend` (backend-dev), `integration` (backend-dev, owns backend
  and frontend), `vision` (vision-dev), `qa` (qa). The TaskCompleted hook relies on these
  names. Use the model the sprint file names (default Sonnet).
- Each spawn prompt: the sprint file path, the teammate's section, its directories, and
  "send your plan to team-lead and wait for approval before writing code".
- Create 5–6 tasks per teammate in the shared task list, with dependencies.

## 5. Plan approval (the human approves, not you)
- Don't put teammates in plan mode: plan mode auto-approves without review.
- For each plan you receive, send the human a summary: goal, files, tests, risks, and
  anything that contradicts the sprint file or the rules. Wait for "approved" or changes,
  then relay the answer to the teammate.

## 6. During the sprint
- Wait for teammates; don't implement their tasks yourself.
- Before re-asking anyone, check `git log`. One agent drives `docker compose` at a time.
- Contract change requests go through `/change-contract`.
- When everything is done, run `/close-sprint $ARGUMENTS`.
