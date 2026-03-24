---
name: workflow-orchestration
description: Workflow discipline for complex tasks. Plan-first thinking, structured task tracking, attention management, error protocols, and verification-before-done. Use PROACTIVELY at the start of any non-trivial task (3+ steps, architectural decisions, multi-file changes).
---

# Workflow Orchestration

How to work — not what tools exist, but WHEN and WHY to use them.

## 1. Plan First, Always

Enter Plan Mode (`EnterPlanMode`) for ANY task with:
- 3+ implementation steps
- Architectural decisions
- Multi-file changes
- Unclear requirements

Skip only for: single-line fixes, typos, obvious bugs with clear instructions.

If something goes sideways mid-implementation: **STOP, re-plan, don't push through.**

## 2. Task Tracking

Use `TaskCreate` / `TaskUpdate` for all planned work:
1. Create tasks with clear acceptance criteria BEFORE coding
2. Set status to `in_progress` BEFORE starting each task
3. Mark `completed` ONLY after verification passes
4. After completing a task, check `TaskList` for next work

Never mark complete if: build failing, implementation partial, errors unresolved.

## 3. Attention Management

After ~20+ tool calls, your original goals drift out of attention.

**Read Before Decide:** Before any major decision or phase transition, re-read the plan. This pushes goals back into your recent attention window.

**For truly complex tasks (10+ steps, multi-session):** Create a single `_plan.md` in the project root as persistent working memory. Structure:

```markdown
# Plan: [Title]
## Goal
[One sentence end-state]
## Phases
- [x] Phase 1: ... (complete)
- [ ] Phase 2: ... (current)
- [ ] Phase 3: ...
## Decisions
| Decision | Rationale |
|----------|-----------|
## Errors
| Error | Attempt | Resolution |
|-------|---------|------------|
## Findings
[Key discoveries, research results, file paths]
```

Delete `_plan.md` when the task is done. Don't leave planning artifacts in the repo.

## 4. Subagent Strategy

Use `Task` tool subagents to:
- Keep main context window clean
- Parallelize independent research/exploration
- Isolate complex analysis from implementation

Rules:
- One focused task per subagent
- `Explore` type for broad codebase research
- `general-purpose` for multi-step analysis
- Never duplicate work between main thread and subagents

## 5. Error Protocol (3-Strike Rule)

```
ATTEMPT 1: Diagnose & Fix
  Read error carefully. Identify root cause. Apply targeted fix.

ATTEMPT 2: Alternative Approach
  Same error? Different method. Different tool. Different library.
  NEVER repeat the exact same failing action.

ATTEMPT 3: Broader Rethink
  Question assumptions. Search for solutions. Update the plan.

AFTER 3 FAILURES: Escalate to User
  Explain what you tried. Share the specific error. Ask for guidance.
```

Log every error in your plan or task tracking. Track what you tried — `if action_failed: next_action != same_action`.

## 6. Verification Before Done

Never mark a task complete without proving it works:
1. `bun run build` — must pass
2. Check for type errors and lint issues
3. Diff behavior before/after when relevant
4. Ask: "Would a staff engineer approve this?"

If verification fails, keep task as `in_progress` and fix.

## 7. Demand Elegance (Balanced)

For non-trivial changes, pause: "Is there a more elegant way?"
- If a fix feels hacky: implement the elegant solution
- If simple and obvious: don't over-engineer
- Challenge your own work before presenting it

## 8. Autonomous Bug Fixing

When given a bug report:
1. Point at logs, errors, failing tests
2. Identify root cause — don't guess
3. Fix it. Don't ask for hand-holding
4. Verify the fix with build/tests
5. Zero context switching required from the user

## 9. Self-Improvement Loop

After ANY correction from the user:
1. Identify the pattern that caused the mistake
2. Update auto-memory with the lesson
3. Write rules that prevent the same mistake

Format: `YYYY-MM-DD: [What went wrong] -> [Rule to prevent it]`

## Core Principles

- **Simplicity First** — Make every change as simple as possible
- **No Laziness** — Find root causes. No temporary fixes. Senior standards
- **Minimal Impact** — Touch only what's necessary
- **Explain Changes** — High-level summary at each step
- **Never Repeat Failures** — Track attempts, mutate approach
- **Files are Memory** — When context gets long, write important state to disk