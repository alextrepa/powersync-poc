# Issue tracker: local Markdown

Issues and specs for this repository live as Markdown files under `.scratch/`.

## Conventions

- Store each feature in `.scratch/<feature-slug>/`.
- Store its specification in `.scratch/<feature-slug>/spec.md`.
- Add `Status: ready-for-agent` near the top of a published specification.
- Store implementation tickets in `.scratch/<feature-slug>/issues/`.
- Use one file per ticket, named `<NN>-<slug>.md`, starting with `01`.
- Record triage state with a `Status:` line near the top of each ticket.
- Append discussion under a `## Comments` heading.

See `triage-labels.md` for the accepted status values.

## Publishing to the issue tracker

When a skill says to publish a specification or issue, create the corresponding file under `.scratch/<feature-slug>/`. Create its parent directories when needed.

## Fetching a ticket

Read the referenced Markdown file. The user will normally provide its path or ticket number.

## Wayfinding operations

The `/wayfinder` skill uses one map file and one child file per ticket.

- Store the map at `.scratch/<effort>/map.md`.
- Store child tickets at `.scratch/<effort>/issues/<NN>-<slug>.md`.
- Record the ticket type as `research`, `prototype`, `grilling`, or `task` in a `Type:` line.
- Record wayfinding state as `claimed` or `resolved` in a `Status:` line.
- Record dependencies in a `Blocked by: NN, NN` line.
- Treat a ticket as unblocked when every listed dependency is resolved.
- Find the next ticket by scanning for open, unblocked, and unclaimed files. Lowest ticket number wins.
- Claim a ticket by setting `Status: claimed` before starting work.
- Resolve a ticket by adding an `## Answer` section, setting `Status: resolved`, and appending a short decision summary with a link to the map.
