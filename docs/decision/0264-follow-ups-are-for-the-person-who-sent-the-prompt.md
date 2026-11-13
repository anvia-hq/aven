# 0264. Follow-ups are for the person who sent the prompt

On a thread several people have open, every one of them with follow-ups turned on asked the small model for suggestions when the agent finished, so one reply cost one call per viewer and the chips were suggestions for a prompt someone else wrote.

- The platform asks for follow-ups only when the latest prompt of the thread, ignoring system notes such as a process ending, was sent by the person looking at it (`lastSubmission` in `@aven/protocol/submitter`, by its sender id, the same rule as the control plane).
- The control plane refuses the same way: `POST /threads/:id/follow-ups` answers no suggestions, and makes no model call, when the latest prompt has a sender who is not the caller. A prompt with no sender on record (older messages) is treated as before.
- The server check is the one that saves the cost; the client check saves the request.
