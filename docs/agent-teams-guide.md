# Agent Teams: Master Reference Guide

> Source: https://code.claude.com/docs/en/agent-teams (captured 2026-11-02).
> Agent teams are **experimental**. Re-check the source page when behavior seems to differ from this guide.

This guide is meant to be read **before designing or launching an agent team** in this project. It condenses the official docs into decision rules, templates, and checklists.

---

## 1. What an agent team is

One Claude Code session (the **lead**) spawns other full Claude Code sessions (the **teammates**). Each teammate has its own context window. The lead and teammates coordinate through a **shared task list** and a **mailbox** (direct messages). The user can also message any teammate directly.

| Component | Role |
| :- | :- |
| **Team lead** | The main session. Spawns teammates, creates and assigns tasks, synthesizes results. This role can't be transferred. |
| **Teammates** | Independent Claude Code instances working on assigned tasks |
| **Task list** | Shared work items: pending, in progress, completed. Tasks can depend on other tasks (blocked). |
| **Mailbox** | Direct messaging between agents by name (`SendMessage`) |

---

## 2. Decide: team, subagent, or single session?

**Use a single session** for sequential work, small or routine tasks, and edits concentrated in the same files.

**Use subagents** for focused tasks where only the result matters, such as a search, a verification, or a quick research question. They cost less because their results are summarized back to the caller.

**Use an agent team** when teammates need to **share findings, challenge each other, and coordinate on their own**, and the work splits into independent parts.

| | Subagents | Agent teams |
| :- | :- | :- |
| Context | Own window; result returns to caller | Own window; fully independent |
| Communication | Return result to caller (named subagents can message) | Teammates message each other directly |
| Coordination | Main agent manages everything | Self-coordination + shared task list |
| Best for | Focused tasks, only the result matters | Complex work needing discussion |
| Token cost | Lower | **Higher**, because each teammate is a separate Claude instance |

### Strongest use cases
1. **Research and review**: several angles investigated at once, then shared and challenged.
2. **New modules or features**: each teammate owns a separate piece.
3. **Debugging with competing hypotheses**: parallel theories that converge faster and avoid anchoring.
4. **Cross-layer coordination**: frontend, backend, and tests, each owned by one teammate.

### Anti-patterns (don't use a team)
- Sequential pipelines where step N needs step N-1's output
- Several agents editing the **same file**, which causes overwrites
- Tasks with many interdependencies
- Routine or small tasks, where the coordination overhead costs more than it saves

---

## 3. Setup (already done in this project)

`.claude/settings.local.json`:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

Important side effects:
- **Requires an interactive session.** With `-p` (headless) or the Agent SDK, no teammates are spawned, and named subagents run as ordinary subagents.
- **Named subagents become teammates.** While teams are enabled, any Agent tool call with a `name` launches a teammate. The exceptions are forks and calls that pass `isolation`. Teams can therefore form without the user explicitly asking for one, and the launch isn't confirmed with the user.
- To disable, set the variable to `"0"`. This takes effect on save, with no restart needed. Higher-precedence settings (project, local, `--settings`, managed) can still turn it back on.

### Display mode (`teammateMode` in `~/.claude/settings.json`, or `--teammate-mode`)
| Value | Behavior |
| :- | :- |
| `"in-process"` (default) | All teammates in the main terminal. Works everywhere, **including the VS Code terminal**. |
| `"auto"` | Split panes if already inside tmux or iTerm2 with `it2`, otherwise in-process |
| `"tmux"` | Split panes; auto-detects tmux or iTerm2 |
| `"iterm2"` | iTerm2 native panes; requires the `it2` CLI and the Python API enabled |

Split panes are **not supported** in the VS Code integrated terminal, Windows Terminal, or Ghostty.

---

## 4. Controls (in-process mode)

| Key | Action |
| :- | :- |
| ↑ / ↓ | Select a teammate in the agent panel |
| Enter | Open the teammate's transcript and message it directly |
| Esc | Clear the selection. While viewing a teammate, Esc interrupts its current turn. |
| `x` | Stop the selected teammate |
| Ctrl+T | Toggle the task list |

- While viewing a teammate, plain text and skills go to **the teammate**, and built-in commands go to **the lead**. `/compact`, `/clear`, and `/rewind` ask for confirmation. `/model` and `/fast` are blocked because a teammate's model is fixed when it spawns.
- Idle rows hide 30s after the whole panel goes idle. The teammate is still running and addressable. More than 3 idle teammates collapse into an `N idle agents` row.

---

## 5. Designing the team

### 5.1 Team size
- **Start with 3–5 teammates.** Three focused teammates often outperform five scattered ones.
- Token cost scales **linearly** with the number of active teammates.
- For example, 15 independent tasks still fit about 3 teammates.
- Scale up only when the extra teammates can actually work at the same time.

### 5.2 Task sizing
- **Too small**: the coordination overhead is larger than the benefit.
- **Too large**: teammates run too long without check-ins, which risks wasted work.
- **Just right**: a self-contained unit with a clear deliverable, such as a function, a test file, or a review.
- **Target 5–6 tasks per teammate** so everyone stays busy and the lead can reassign work if someone gets stuck.
- Use **task dependencies** for ordering. Blocked tasks aren't self-claimed, and they unblock automatically when their dependencies complete.

### 5.3 File ownership
**Assign each teammate a distinct set of files or directories.** Two teammates editing the same file overwrite each other. State the ownership explicitly in each spawn prompt.

### 5.4 Naming
Tell the lead exactly what to call each teammate, such as `researcher`, `backend`, or `security-reviewer`. Predictable names make later prompts, messages, and shutdowns easy.

### 5.5 Model choice
A teammate's model is the first of these that applies:
1. The model named in the spawn prompt for that teammate
2. The subagent definition's `model` (`inherit` means the lead's model)
3. `CLAUDE_CODE_SUBAGENT_MODEL`, unless it's `inherit`
4. The lead's current model

`CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` skips sources 1 and 2. Teammates inherit the lead's effort level. Rule of thumb: use a cheaper model such as Sonnet for mechanical or parallel refactors, and the strongest model for architecture, debugging, and review synthesis. `teammateDefaultModel` was removed, so name the model in the prompt instead.

### 5.6 Context: the most common failure point
Teammates **automatically load** CLAUDE.md, MCP servers, and skills. They **do not get the lead's conversation history**. Every spawn prompt must be self-contained:
- **Goal**: what "done" looks like
- **Scope**: the exact files or dirs it owns, and what it must not touch
- **Background facts**: tech stack and decisions already made, such as "JWT in httpOnly cookies"
- **Focus areas**: what to look for or what to build
- **Output format**: for example severity ratings, a findings doc path, or a summary shape
- **Collaboration**: who to message, and when to challenge or hand off to them

### 5.7 Reusable roles through subagent definitions
Define a role once in `.claude/agents/<name>.md`, or at user, managed, or plugin scope, and spawn it as a teammate:
> "Spawn a teammate using the security-reviewer agent type to audit the auth module."

How the definition's fields apply to a teammate:
| Field | In-process teammate | Split-pane teammate |
| :- | :- | :- |
| `tools` | Applied, plus `SendMessage` and the Task tools | Applied |
| `model` | Applied unless the prompt names one | Applied |
| `disallowedTools` | Applied (`SendMessage` and the Task tools still kept) | — |
| `effort` | Applied | — |
| `autoCompactWindow` | Applied (v2.1.296+) | Ignored |
| Body | **Appended** to the default system prompt | **Replaces** the default system prompt |
| `skills` | **Not applied**; loads project and user skills | **Not applied** |
| `mcpServers` | Ignored; uses project and user MCP | Applied |

Don't hand-write `~/.claude/teams/.../config.json` or a project `teams.json`. Neither is configuration. Use agent definitions instead.

---

## 6. Proven team patterns and prompt templates

### A. Parallel review (multiple lenses)
```text
Spawn three teammates to review PR #142, named security, perf, and tests:
- security: security implications
- perf: performance impact
- tests: test coverage
Each reviews independently and reports findings with severity. Then synthesize.
```
Why it works: a single reviewer tends to focus on one kind of issue. Distinct lenses keep the reviews from overlapping.

### B. Competing hypotheses (adversarial debugging)
```text
Users report the app exits after one message instead of staying connected.
Spawn 5 teammates to investigate different hypotheses. Have them message each
other to try to disprove each other's theories, like a scientific debate.
Update docs/findings.md with whatever consensus emerges.
```
Why it works: it avoids **anchoring**. The theory that survives active attempts to disprove it is most likely the real cause.

### C. Multi-perspective design exploration
```text
I'm designing <X>. Spawn three teammates: one on UX, one on technical
architecture, one playing devil's advocate. Have them challenge each other,
then synthesize a recommendation.
```

### D. Cross-layer feature build
```text
Spawn 3 teammates for feature <X>:
- backend: owns src/api/** only
- frontend: owns src/ui/** only
- tests: owns tests/** only; writes tests against the agreed API contract
Agree on the API contract first (backend proposes, others confirm via message).
Break the work into 5-6 tasks each with dependencies.
```

### E. Plan-first implementation (risky changes)
1. Switch the lead into **plan mode** (Shift+Tab).
2. "Spawn an architect teammate to refactor the authentication module."
3. The teammate works read-only until its plan is ready.
   - Spawned while the lead is in plan mode: the plan is **auto-approved** when it arrives.
   - You put a running teammate into plan mode with Shift+Tab: the **lead** reviews and approves the plan or sends it back.
4. Edits after approval still go through the normal permission prompts.

### F. Well-specified single teammate
```text
Spawn a security reviewer teammate with the prompt: "Review the authentication
module at src/auth/ for security vulnerabilities. Focus on token handling,
session management, and input validation. The app uses JWT tokens stored in
httpOnly cookies. Report any issues with severity ratings."
```

---

## 7. Running the team

- **Assigning tasks:** the lead assigns tasks explicitly ("give task X to backend"), or teammates **self-claim** the next unassigned, unblocked task. File locking prevents double-claiming.
- **Messages are delivered automatically**, so there's no need to poll. When a teammate goes idle, the lead is notified **with the teammate's final answer**. A failure on an API error is reported with the error text.
- **No broadcast:** messaging everyone means sending one message per recipient.
- **Monitor and steer:** check progress, redirect weak approaches, and synthesize as results arrive. Don't leave a team running unattended for long.
- **Keep the lead coordinating:** if the lead starts doing teammates' tasks itself, say: *"Wait for your teammates to complete their tasks before proceeding."*
- **Premature finish:** if the lead declares the work done before all tasks are complete, tell it to keep going.
- **Shutdown:** "Ask the researcher teammate to shut down." The teammate approves or rejects the request with a reason. Shutdown waits for its current tool call to finish. Team directories clean up when the session ends.

### Quality gates with hooks
| Hook | Fires when | Exit code 2 does |
| :- | :- | :- |
| `TeammateIdle` | A teammate is about to go idle | Sends feedback and **keeps it working** |
| `TaskCreated` | A task is being created | **Blocks creation** and sends feedback |
| `TaskCompleted` | A task is being marked complete | **Blocks completion** and sends feedback, for example when tests don't pass |

Good uses include requiring tests or lint to pass before `TaskCompleted`, and enforcing a task naming or scope convention on `TaskCreated`.

---

## 8. Permissions and security

- Teammates start in the **lead's permission mode**, except `dontAsk`, which they don't inherit. If the lead runs with `--dangerously-skip-permissions`, all teammates do too.
- A per-teammate mode **can't be set at spawn**. It can only be changed afterwards.
- **Teammate permission prompts appear in the lead session.** Pre-approve common operations in permission settings before spawning to reduce interruptions.
- In-process teammates follow the lead's live rules (`--allowedTools`, `--disallowedTools`, `--tools`). Split-pane teammates **don't** receive `--allowedTools`; put those rules in `--settings '{"permissions":{"allow":[...]}}'` instead.
- Messages between agents are marked as coming from another Claude session, not from the user. A teammate **can't approve prompts or give consent on the user's behalf**, and can't relay a denied action to another teammate to get around the check. In auto mode, the classifier screens messages between agents and treats relayed approvals as untrusted.

---

## 9. Cost notes

- Token usage scales with the number of active teammates. The extra cost is usually worth it for research, review, and new features, and not for routine tasks.
- In-process teammates use a **5-minute prompt cache by default**. Setting `subagentPromptCacheTtl: "1h"` keeps it longer, but 1-hour cache writes are billed at a higher rate.

---

## 10. Storage (for debugging)

| Item | Path | Lifetime |
| :- | :- | :- |
| Team config | `~/.claude/teams/{team-name}/config.json` | Deleted at session end |
| Mailboxes | `~/.claude/teams/{team-name}/inboxes/{agent-name}.json` | With the team dir |
| Task list | `~/.claude/tasks/{team-name}/` | Persists (`cleanupPeriodDays`) |

`{team-name}` is `session-` followed by the first 8 characters of the session ID. The config's `members` array lists names, agent IDs, and agent types (the lead is `team-lead`), and teammates can read it to discover each other. Don't edit it, because runtime state overwrites it.

---

## 11. Limitations (know these before planning)

- **No resumption:** `/resume` and `/rewind` don't restore in-process teammates. After a resume, tell the lead to spawn new teammates.
- **Task status can lag:** a teammate may not mark its task complete, which blocks dependent tasks. Verify the work is done, then update the status or nudge the teammate.
- **Slow shutdown:** teammates finish their current request first.
- **One team per session.** Teams can't be named or shared across sessions.
- **No nested teams:** teammates can't spawn teammates. Only the lead manages the team.
- **No background subagents from in-process teammates.** `background: true` and `run_in_background: true` fail or run in the foreground.
- **The lead is fixed** for the life of the session.
- **Permissions are set at spawn** (see §8).
- **Split panes need tmux or iTerm2** (see §3).

---

## 12. Troubleshooting

| Symptom | Fix |
| :- | :- |
| Teammates not appearing | Check the agent panel (↑/↓). The row may be hidden while idle, so message the teammate by name. The task may be too simple to warrant a team. For split panes, check `which tmux` or the `it2` CLI plus the Python API. |
| Claude used subagents instead | Ask again and **explicitly request an agent team**. The panel shows both, so its contents alone don't confirm a team formed. |
| Unwanted teammates instead of subagents | Set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` to `"0"` |
| Too many permission prompts | Pre-approve common commands in the permission settings |
| Teammate stopped on an error | Open its transcript, then give it instructions or spawn a replacement. A message wakes a teammate that is waiting on an API retry. |
| Lead stopped early | Tell it to keep going |
| Lead doing the work itself | "Wait for your teammates to complete their tasks before proceeding" |
| Orphaned tmux session | `tmux ls`, then `tmux kill-session -t <name>` |
| Message to a teammate fails | Disk full or mailbox dir not writable; see the docs' errors page |

---

## 13. Pre-launch checklist

Before spawning a team, confirm:

- [ ] The work really benefits from **parallel, independent** effort. Otherwise use subagents or a single session.
- [ ] The session is **interactive** (not `-p` or the SDK).
- [ ] There are **3–5 teammates**, each with a **clear, distinct role** and a **predictable name**.
- [ ] Each teammate **owns distinct files**, with no overlap.
- [ ] Each spawn prompt is **self-contained**: goal, scope, background, focus, output format, and who to talk to.
- [ ] The work is broken into **5–6 tasks per teammate** with **dependencies** where order matters.
- [ ] A **model** is chosen per role, with cheaper models for mechanical work.
- [ ] Risky work starts with the **lead in plan mode**.
- [ ] Common **permissions are pre-approved**.
- [ ] Optional **hooks** are set (`TaskCompleted` gating on tests, `TeammateIdle` checks).
- [ ] The **synthesis output** is defined: where the final findings or summary will be written.
- [ ] The lead will be told to **wait for teammates** and to **shut them down** when done.

---

## 14. Master spawn-prompt template

```text
Create an agent team for: <overall goal>.

Spawn <N> teammates (use <model> unless noted):

1. <name> — <role>.
   Owns: <files/dirs>. Must not edit: <files/dirs>.
   Context: <stack, decisions, constraints>.
   Deliverable: <concrete output + format + location>.
   Coordinate with: <names> about <topic>.

2. <name> — ...

Process:
- Break the work into ~5-6 tasks per teammate with dependencies where needed.
- Teammates should message each other to <share findings / challenge assumptions / agree on interfaces>.
- Wait for all teammates to finish before synthesizing.
- Final output: <synthesis doc path / summary format>.
- Shut down all teammates when done.
```
