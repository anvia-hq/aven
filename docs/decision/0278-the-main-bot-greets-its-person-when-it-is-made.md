# 0278: The main bot greets its person when it is made

Status: accepted. Builds on 0059 (a bot has a computer) and the greeting a bot made by the main bot already gets.

## Context

A bot the main bot makes is woken once with a note that it was just created, and writes its own hello with its model. The main bot itself is made the first time its person opens the bot list, and its empty chat showed a fixed line, "Say hello to Aven.", until the person wrote first.

## Decision

- **The first read of the bot list that makes the main bot also wakes it with the same note.** The main bot answers with its model, in its own words, as it does for a bot it made. The person sees it when they open the chat.
- **No model, no greeting.** If the person has no provider yet, the wake fails and is logged; the fixed line stays until they write. A greeting is not retried when a provider is added later.
- The greeting costs the person's own model a short call, once per person.

## Consequences

- A person who has a provider before they first open the bot (an invited one, or one who set it up first) is greeted at once; most new people have none and see the fixed line, so the main gain is for them after they add one and write.
