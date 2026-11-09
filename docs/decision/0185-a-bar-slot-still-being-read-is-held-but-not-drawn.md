# 0185: A ship bar slot that is still being read is held, not drawn

Status: accepted. Refines decision 0184.

## Context

Decision 0184 fills a slot that is still being worked out with a placeholder of the same size, so
the composer does not move. The placeholder was drawn as an outlined box. On a new thread the
runner has no workspace yet and may be busy making the environment, so the changes request waits
for a long time and the person saw an empty box above the composer for minutes, with nothing to
say what it was.

## Decision

A placeholder keeps its space and is not painted. The slot is still announced to assistive
technology as a status, and the bar does not move when the real button or badge arrives.
