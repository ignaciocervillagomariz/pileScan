# Team workflow (complements CLAUDE.md)

Loaded every session. CLAUDE.md has the ownership table, ground rules and conventions; this
file only adds what the first two sprints taught us.

## Coordination
- Before re-asking a teammate for something, check `git log` and `git status`: a "done"
  message often crosses with your follow-up.
- Messages from a previous sprint's teammates can arrive late under the same name (`qa`).
  Check timestamps and `ListAgents` before acting on them.
- An in-process teammate woken by a new message may first process an old shutdown request and
  stop. After waking one, confirm it is working (git log, its transcript).
- Plan approval: plan mode auto-approves teammate plans without anyone reviewing them. Use the
  message protocol instead: the teammate sends its plan to `team-lead`, the lead relays it to
  the human and waits for an explicit "approved" before telling the teammate to start.
- Teammate names are fixed per role: `frontend`, `backend`, `integration` (backend + frontend),
  `vision`, `qa`. The TaskCompleted hook maps these names to checks.

## Where knowledge goes
- `.claude/rules/` (committed): durable facts and gotchas. Path-scoped files load when you
  work in that directory. Update them at sprint close; delete lines that are no longer true.
- `.claude/handoff/` (git-ignored): a short snapshot of the current state. Rewritten, never
  appended, at every sprint close (see `/close-sprint`).
- `docs/decisions/`: architecture decisions (ADRs). `docs/build-summary.md`: what each
  sprint shipped.

## Safety
- Never set `BIND_ADDRESS=0.0.0.0` or start a public tunnel (cloudflared, ngrok) without the
  human's explicit OK in this session. If the permission classifier blocks it, that is correct:
  don't work around it.
- Measure vision changes with the eval (`/run-eval`), never by eye. Freeze a "before" image of
  the inference service before changing detector behavior.

## Shell gotchas (macOS, zsh)
- zsh does not word-split `${var:+-H "..."}`; build curl arguments with arrays or functions.
- Stage explicit paths (`git add backend/`); `git commit -a` sweeps up teammates' files.
