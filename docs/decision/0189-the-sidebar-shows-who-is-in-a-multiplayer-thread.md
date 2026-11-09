# 0189: The sidebar shows who is in a multiplayer thread

Status: accepted. Builds on 0179 and 0188.

## Context

A thread shared with the workspace has a Share mark in the sidebar. It says nothing about a thread
that teammates are driving (0179): a creator could not tell from the list which threads other
people had joined, or who.

## Decision

- A thread in the list carries `participants`: the people who have sent it a message, in the order
  they first did, from the sender rows of 0188 (`thread_message_senders`).
- A thread shared with the workspace shows its people when multiplayer is on or someone besides
  the creator has written to it, at the end of its row just before the time, and the Share mark at
  its start goes: the creator first, then the others, as initials in overlapping circles, three at
  most. When there are more, a circle reads `n+` with
  the number not shown. The names are in its label and title, the creator's included.
- A thread with multiplayer off and nobody else's messages keeps the Share mark.

## Consequences

- Someone who joined before 0188 has no sender row, so is not counted until they write again.
- A person is shown by initials, as elsewhere. Their picture is later work.
