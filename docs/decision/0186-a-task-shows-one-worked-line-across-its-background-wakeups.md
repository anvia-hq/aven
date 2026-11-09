# 0186: A task shows one Worked line across its background wake-ups

Status: accepted. Refines decisions 0176 and 0182 where they hide the process note.

## Context

When a background command ends, the agent is woken by a hidden process note and answers again. A
task that waited on a test suite and then on CI had three runs, so the thread showed three
"Worked for" lines in a row, with the process notes between them hidden. It read as one answer
with duplicated timers.

## Decision

- A finished answer that follows another answer with only process notes between them is shown as
  part of that answer: its steps join the same fold, and its time is added to the same "Worked
  for". A message from a person, a question or a note that is not a process note keeps answers
  apart.
- A run that is still going is not merged, so its steps are read as they come. It joins the answer
  before it when it ends.
- This is only how the thread is drawn. What is stored, and what the agent is told, does not
  change, and each run keeps its own time in the database.
