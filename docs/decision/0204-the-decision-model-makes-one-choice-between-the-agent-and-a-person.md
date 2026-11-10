# The decision model makes one choice between the agent and a person

Status: accepted. Replaces the two yes or no questions of 0191 and the two thresholds of 0193.

## Context

The gate asked two independent questions, "is it for the agent" and "is it for a person", and kept the agent out only when the person score was at least 0.6 and the agent score at most 0.4. The two could disagree, so most unclear messages went to the agent. A message such as "Please lemme know if i can work on this mas." followed a talk with a teammate and still reached the agent, since "asking the agent to answer something" fits it as well. The prompt did not say that a message with no name continues the talk before it, nor that a term of address (here "mas") points to a person, nor that a question about the project can be for a person.

## Decision

- One `choice` question with two options, `agent` and `person`. Jev answers it natively, and its probabilities add up to one.
- The instructions say that a message with no name usually continues the recent talk, what points to a person (a first name, a term of address, a greeting, a reply to a question) and what points to the agent (a request for code work or a command), and that a question about the project can be for a person.
- The gate keeps the agent out only when `person` gets at least 0.6. Anything less, a failure or a timeout lets the agent answer, as before.
- The gate logs the score and the outcome for each message, with the author's name and no text, so a wrong decision can be looked at.

## Consequences

- A single answer replaces two scores that could not both be true, and one threshold replaces two.
- A message wrongly kept from the agent is still run by saying it again with `@agent`.
- This was judged on one case in a thread. The prompt has not been tried on a set of real messages; the logged scores are how to tune it.
