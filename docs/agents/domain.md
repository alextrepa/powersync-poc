# Domain documentation

This repository uses a single-context domain documentation layout.

## Before exploring

Read these files when they exist and apply to the task:

- `CONTEXT.md` at the repository root
- ADRs under `docs/adr/`

Proceed without comment when either location does not exist. The `/domain-modeling` skill creates domain documentation when project terminology or architectural decisions need to be recorded.

## Layout

```text
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-example-decision.md
│       └── 0002-another-decision.md
└── src/
```

## Use the project vocabulary

Use terms as defined in the glossary in `CONTEXT.md`. Do not replace established terms with synonyms in issue titles, specifications, tests, or implementation plans.

An undefined concept may mean the proposed term does not fit the project or that the domain model has a real gap. Reconsider the wording first. Record a genuine gap for `/domain-modeling`.

## Flag ADR conflicts

Call out any proposal that conflicts with an existing ADR. Name the ADR and explain why the decision may need to be reopened. Do not silently override it.
