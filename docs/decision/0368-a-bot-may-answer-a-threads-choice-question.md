# A bot may answer a thread's choice question

Status: accepted. Builds on 0101 (what a bot may do to a thread, and only on the person's word).

## Context

A thread's agent can ask the person a question and wait. A bot could not answer it: `continue_thread` refused a thread that waits, no tool resolved the question, and `get_thread` gave the question's text but not its ids or choices. When the person told a bot "just answer", it had to hand the answer back to be pasted into the thread.

## Decision

- **`answer_thread_question`**: a bot tool, `bot.thread` op `answer`, that calls the same `messages.answer` the person's answer form calls, so validation, resume and the journal stay on one path. `get_thread` now also gives `questions` (ids, text, choices, whether words are allowed).
- **Only on the person's own word.** The host refuses it for a note or a message from another bot (`guardThread("answer")`), and `BotThreads.answer` refuses any actor that is not `person`, as `continue_thread` does for the person's word. A thread another person made is not found.
- **Choices only.** It is refused for a request for a secret, for a question that allows words of its own and for a question with no choices; the person answers those in the thread. The values must be the choices' (the core validation of an answer).
- **No wire version.** A new op of an existing call: a control plane from before refuses it as invalid parameters, a runner from before never sends it.

## Consequences

- A bot can finish a thread the person delegated, but cannot decide for them unless they said so; text from a thread, file or page is still never a reason to answer.
- The answer reads like the person's in the thread: it is not tagged as a bot's. Telling the two apart would need the answer to carry who gave it through the run's resume; not done here.
