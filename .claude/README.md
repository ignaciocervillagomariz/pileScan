# How this project is built with Claude Code

PileScan is developed by a human owner directing Claude Code, sometimes as a single session and
sometimes as an agent team. This folder holds the reusable setup; the sprint-specific
instructions live in `docs/sprints/`.

```
.claude/
├── README.md            this file
├── settings.json        shared settings: the TaskCompleted quality gate
├── settings.local.json  local only (git-ignored): enables agent teams
├── agents/              role definitions, used as teammates or subagents
│   ├── frontend-dev.md  backend-dev.md  vision-dev.md  qa.md
│   └── code-reviewer.md read-only reviewer subagent
├── skills/              procedures, run as slash commands
│   ├── start-sprint/    /start-sprint N  (+ sprint-template.md)
│   ├── close-sprint/    /close-sprint N
│   ├── change-contract/ /change-contract <what and why>
│   └── run-eval/        /run-eval <label> [compare-to]
├── rules/               durable knowledge, loaded automatically
│   ├── team-workflow.md always loaded
│   └── backend.md frontend.md inference.md tests-and-eval.md api-contracts.md
│                        loaded only when working in those directories
├── hooks/task-gate.sh   the quality gate script
└── handoff/             local only (git-ignored): snapshot of the current state
```

## Where things go

| Kind of information | Where | Lifetime |
| --- | --- | --- |
| Project rules, stack, ownership, conventions | `CLAUDE.md` | permanent |
| Gotchas and facts about one area | `.claude/rules/<area>.md` | until no longer true |
| Who a role is and how it works | `.claude/agents/<role>.md` | permanent |
| Multi-step procedures | `.claude/skills/<name>/` | permanent |
| What this sprint must deliver | `docs/sprints/sprint-N.md` | one sprint |
| Where we are right now | `.claude/handoff/` | rewritten every sprint |
| Why we decided something | `docs/decisions/` (ADRs) | permanent |

## Running a sprint

1. Start Claude Code in the repo root (in tmux from Terminal or iTerm2 if you want split
   panes; they don't work in VS Code's integrated terminal).
2. `/start-sprint 3`: the lead reads the handoff, drafts `docs/sprints/sprint-3.md` from the
   template if needed, and waits for your approval.
3. The lead spawns the teammates from `agents/` with fixed names (`frontend`, `backend`,
   `integration`, `vision`, `qa`) and relays each plan to you. Nothing is built until you
   approve the plan.
4. Teammates can't mark a task complete with uncommitted work or failing fast checks: the
   TaskCompleted hook (`hooks/task-gate.sh`) sends them back with the reason. Its log is
   `.claude/hooks/task-gate.log`. Turn it off with `"PILESCAN_TASK_GATE": "off"` under `env`
   in `settings.local.json`.
5. `/close-sprint 3`: docs updated, durable lessons moved into `rules/`, the handoff rewritten,
   the team shut down, and a summary for you.

## Team, subagent or single session?

- **Single session** for work in one area or sequential work (a UI redesign, one bug).
- **Subagent** when only the result matters: `code-reviewer` on a commit range, a research
  question.
- **Agent team** when the work crosses layers and parts can run in parallel. Teams cost
  significantly more tokens than a single session.
- **Never delegated:** the rarity-weighted ranking and the training pipeline are the owner's.

With agent teams enabled, Claude can start teammates on its own when it names a subagent. For a
single-session sprint, set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` to `"0"` in
`settings.local.json`.

More background: `docs/agent-teams-guide.md`.
