# A decision keeps its number, and the README names the ones that no longer hold

Status: accepted. Keeps 0154 (a superseded decision keeps its number) and gives the folder a README, a rule for its numbers, and a test.

## Context

`docs/decision/` held 383 decisions and about 1 MB before this one. The proposal was to move the long ones to `docs/ADR` and keep only what is current in `docs/decisions/`. Reading the folder first:

- No decision is long. The median is 2.2 KB, about 23 lines; nine in ten are under 5 KB. The longest, 0242, is 17.8 KB because it carries the Claude backend's parity table. The weight is the number of files, not their size.
- The folder is already what ADR means, and `docs/README.md` says so. A rename would have to move every reference into it — 51 mentions of the path in 40 files and 391 mentions of a decision's number in prose, counted with `grep -rn` before this change — in code, tests, rules and products, and buy nothing.
- What it lacked was unique numbers: twelve numbers were used twice or three times, so "decision 0298" named two different decisions, one of them the macOS app in `AGENTS.md`. A title could carry a number of its own that was not its file's either: 0354 said 0353.
- Eight decisions had no `Status:` line and three put it in a bullet, though `docs/README.md` asks for one; a hundred and ten wrote their number into the title as well, and nineteen kept a `Date:` line of their own. Nothing checked the format, so each hand-written file drifted on its own. The title carries no number now, and a date is part of the `Status:` line.
- Nothing said which of the 383 still hold without opening each file. The folder takes thirty-two decisions in a day at its busiest, so that only gets worse.
- 0154 already decided that a superseded decision keeps its number and status, because it still records what was decided and why. Moving or deleting the superseded ones reverses it.
- One status line belonged to another decision: 0211 carried "nothing is built for macOS VMs", from a pull request that never landed, and 0219 pointed at 0211 for it.
- Three decisions were marked superseded whole by 0219 (0008, 0012, 0013) while the system reference still cites them for what survived: the topology, the tools that come from the machine, and a project's read-only GitHub token. They now say in part.
- The folder did not agree with itself about which decisions were superseded. About thirty recorded it in prose no reader or test could find ("the rule that attached files are not saved is superseded by 0341"), some recorded it only in the superseding decision's text, and five were superseded by another decision that said so while their own `Status:` line still read `accepted`. Each of them now says `Superseded by 0363` or `Superseded in part by 0341` in its own `Status:` line.

## Decision

- One folder, `docs/decision/`. There is no `docs/ADR` and no second folder for the current decisions.
- A number is unique, permanent and never reused. Two pull requests that take the same number end with the later one at the next number at the end of the folder, and every reference to it moves in the same change. This moved thirteen files to 0374 to 0386; 0298 says in its own text that it moved there from 0297 the same way.
- Every decision starts with a `# Title` that carries no number, then a `Status:` line, in the first lines of the file. The number lives in the file name, and a date, where it matters, ends the `Status:` line as `Decided 2026-11-15.`
- 0154 stands for decisions: a superseded decision keeps its number and its `Status:` line.
- A decision that a later one supersedes says so in that `Status:` line, in one of two forms the folder and the tests read: `Superseded by NNNN` for the whole decision, `Superseded in part by NNNN` for a named part of it. A relation that is not a supersession — `changes`, `narrows`, `extends`, `refines`, `replaces one rule of` — is prose, and is not one of these two.
- `docs/decision/README.md` lists every decision whose `Status:` line says so, in two tables, with what replaced it. It is the folder's index: GitHub shows it when a person opens the folder.
- `tooling/docs/decision-folder.test.mjs` keeps all of it true, in `bun test`: a number used twice, a title number that is not the file's, a decision with no `Status:` line or two of them, a superseded decision the README does not list, a row that names a replacement its own `Status:` line does not, and a count that disagrees with the folder all fail.

## Consequences

- 298 decisions are current, 37 are superseded and 49 are superseded in part.
- Adding a decision is a number at the end of the folder, and one edit to the README's count line. Its tables change only when a decision supersedes another one.
- The index says what the folder says. A decision that a later one supersedes without recording it is a defect the test cannot see, because the test reads the `Status:` lines and not the prose of the superseding decision; the reverse direction is what the rule above asks a person to keep.
- The folder keeps the gaps at 0122, 0253 and 0303, because a number is never reused.
- The long decisions stay long. The parity table of 0242 belongs to the decision that made the Claude backend, and `docs/products/0007-system-reference.md` points at it.
- A reader who wants what holds today starts at the system reference, then at the README's tables, not at the folder's first file.
