# Sprint N: <short goal>

Dates: <start> – <end> · Status: draft | approved | done

## Goal
One or two sentences: what will be true at the end of the sprint that isn't true now.

## Why now
Link the handoff item, eval number or bug this sprint answers.

## Scope
- **In:** ...
- **Out (explicitly):** ...
- **Reserved for the owner (never in a sprint):** `RarityWeightedRankingStrategy`, `/training`.

## Team
Leave a role out if it has nothing to do. Teams cost more than a single session.

| Name | Agent type | Model | Directories |
| --- | --- | --- | --- |
| integration | backend-dev | sonnet | `/backend`, `/frontend` |
| vision | vision-dev | sonnet | `/inference` |
| qa | qa | sonnet | `/tests`, `/eval`, `docs/eval/`, `fixtures/real/*.csv` |

## Contract changes
None | describe them (the lead makes them before the team starts).

## Tasks

### <name>
1. <task> — **Done when:** <observable acceptance criterion>
2. ...

### qa
1. Test plan for this sprint.
2. Verify each "complete" message; eval before/after if vision changed.
3. `tests/report-sprintN.md`.

## Definition of done
- [ ] All suites green (or failures filed and owned).
- [ ] Eval numbers in `docs/eval/baseline.md` if detection changed.
- [ ] ADR for each architectural decision.
- [ ] `docs/build-summary.md` has a section for this sprint.
- [ ] Handoff rewritten with `/close-sprint`.

## Risks and open questions
- ...
