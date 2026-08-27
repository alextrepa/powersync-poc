## Agent skills

### Issue tracker

Issues and specs use local Markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The repository uses the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

The repository uses a single-context domain documentation layout. See `docs/agents/domain.md`.

## Manual QA routines

Manual QA procedures live under `tests/qa/routines/` and are indexed in `tests/qa/README.md`.

- A routine is a coherent set of manual checks that produces one verifiable pass, fail, or blocked result.
- A feature may require more than one routine. Do not force unrelated checks into one large routine.
- A routine is affected when a change alters its user-visible behavior, prerequisites, fixture data, commands, expected results, pass criteria, or required evidence.
- Feature work is not complete until the same change creates or updates every affected routine, updates the catalog, and changes implemented routines from `planned` to `executable`.
- Keep execution evidence in the routine's log or link to retained artifacts. Do not treat an automated test as a substitute for the required manual routine.
