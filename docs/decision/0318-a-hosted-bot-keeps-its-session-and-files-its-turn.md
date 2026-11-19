# A bot on an agent backend keeps its session and files its turn

Status: accepted. Adds to 0310 (a bot runs on the agent its provider names), 0059 (a bot's computer
and conversation) and 0242 (the Claude backend).

## Context

0310 gave a bot's reply the runner's agent backends. It settled how a reply is driven — the bot's
parts, its token, its model and effort — and left the bot's conversation open, because the two paths
keep one differently:

- **Native.** `createBotAgent` is an `Agent` whose memory is the control plane's (`bot.memory`): it
  reads the chat before each turn, files the turn after it, and summarizes past `compactAfterTokens`
  with the bot's own model. The chat the person opens is `botMessagesToChat` over that store, so it
  is the conversation itself.
- **Hosted.** `hostedAgent` (`packages/runtime-client/src/bot-replies.ts`) built the bot's parts and
  gave them to the runner's `claude` or `codex` backend. Nothing filed the turn, and the store was
  never read, so a bot on a subscription answered every message as a stranger and its chat was empty
  again the next time it was opened: a reply lived only in `BotRunner`'s channel.

Two smaller things were wrong on the same path. `bot.reply` asked the backend for its own question
tool as well (`questions: true`), but a bot's reply cannot park — `hostedAgent` throws "This bot
cannot park on a question from its agent" — while a bot asks with `ask_question`, which is in its
catalog and posts the card through `bot.question`. And the agent's workspace came from the runner's
own sandbox rather than the reply's computer, so a bot whose computer is another machine had its
model in a folder its tools could not see.

## Decision

**The model's context is the backend's session.** The Claude and Codex backends keep a session per
thread id (`ClaudeSessions`, `CodexSessions`), and a reply already names the bot's id as its thread
id, so consecutive replies resume one session — the conversation the model had, tool calls included,
as a thread's runs share one. A bot that moves to another runner, or whose runner lost its journal,
starts that agent's conversation again; what the person sees does not depend on it.

**The reply files its turn.** When the backend's run ends, the runner appends the run's messages to
the bot's conversation through `bot.memory`'s `append` (`rememberBotTurn` in `remote-bot-memory.ts`),
the same store the native agent writes, and on a failed run it files what the agent had done
(`unfinishedMessages`), as a run's driver does. The chat is a projection of that store, so it is now
the same after a reload or a restart as it was live. The turn is filed with the backend's durable id
as its run id and `turn: 0`: a bot's transcript has no run cursor to keep, and the store appends.

**Aven summarizes nothing for a hosted bot.** `compactAfterTokens` is the native agent's trigger on
the memory it sends the model. A hosted bot's model reads its own session, which compacts itself
when it fills (0242), so the control-plane transcript is for the person alone. Settings > Bots says
that instead of offering a number that would do nothing.

**A hosted bot asks with `ask_question`.** `questions` stays `false` on the reply's backend input, so
the backend's `ask_user` is not offered and its park cannot end a reply.

**A reply works in its own computer.** The agent's workspace is the reply's computer — the machine
when the reply is placed on one (`PlacedWorkspaces` covers a run the same way) — not the runner's
folder of the same id.

## Consequences

- A bot on a subscription keeps what it said, shows its chat again after a reload, and can be moved
  to another provider without losing the transcript.
- A bot's stored transcript grows with no summarizer on a subscription: it is what the person
  scrolls, not what the model reads.
- The fakes (`AVEN_CLAUDE_FAKE`, `AVEN_CODEX_FAKE`) answer a bot by calling its `send_message`, the
  tool the real model is told to use, so `e2e/bots-backend.spec.ts` proves a bot answers on each
  subscription end to end. A thread's fake reply is a sentence, unchanged.
- Not in this decision: a summary of a subscription bot's transcript, and moving one bot's session
  between runners.
