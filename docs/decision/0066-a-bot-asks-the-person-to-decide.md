# A bot asks the person to decide

Status: accepted. Builds on 0058, 0059 and 0065. The model is the Anvia harness's `ask_question`: a card of choices, a turn that ends there, the answer coming back as a message, and a sub-bot's question going through the main bot.

## Context

A bot could only talk. When it needed a decision it had to ask in a message and read the reply, with no choices on offer and nothing to say that it was waiting. The harness gives a bot `ask_question`; the person asked for bots to work like that.

## Decision

- **Every bot has `ask_question`**, except in a reply a note started (the greeting, and later schedules and goals): nobody is there to answer, and the control plane refuses it as well. It takes one to four questions with their own ids, each with two to five choices of different words and optionally `allowCustom`; the questions are the thread agent's own `QuestionPrompt`, so the platform's question fields are reused. A choice is its words only: what the person clicks is what they send back, so a bot cannot make a harmless-looking label mean something else (`toQuestions` sets the value to the label, in the tool, on the control plane and when a chat is read back). A reply may ask once. The bot's instructions say to ask only what it needs to go on, to stop after asking, and not to ask the same thing in a message.
- **It is a card, not a bubble.** The call is `bot.question` (wire version 30): the control plane puts the questions on a chat message (`BotChatMessage.questions`, with the questions as its words) in the bot's chat. The card is open until the person says something after it, whether the answer or anything else; what other bots write to this bot meanwhile, or the bot going on, does not spend it, and a half-filled card is kept while the bot works.
- **The answer is the person's next message.** The card sends it with the composer's own call, the answer alone for one question and each question with its answer for several (`answerText`), so it is the person's word, in the chat and in the bot's memory, and a reload reads it back. For several questions the answers are numbered in the order asked, without the bot's words about its questions, so the card cannot put a sentence of the bot's in the person's mouth. The tool ends the bot's turn with "stop now": nothing is suspended and nothing is kept between turns.
- **A bot that is not the main one, answering another bot, has the main bot ask.** The person is not looking at that bot's chat. The control plane sends the main bot a message (`[from scout] Scout (scout) needs a decision from the person to go on: …`, with the choices) that tells it to ask the person with `ask_question` and send the answer back with `send_message`; it counts as one of the reply's messages to bots and is a message between bots in both chats. What the sub-bot wrote in it (its name, the ids, questions and choices) is one line each and the whole is cut to a message's size, with what to do first, so it cannot add lines or an instruction of its own. The main bot, answering a bot, asks the person in its own chat.
- **A reload shows the same**: `botMessagesToChat` reads an `ask_question` call as the card, or, when its result says it was relayed, as the message to the main bot, and leaves out one that failed.

## Consequences

- A question that is never answered is a card that stays open at the end of the chat; the bot waits, as it would for any message.
- A sub-bot's question reaches the person only if the main bot does what it is told: it is a request to a colleague, not a guarantee.
- The answer is text, so a bot reads "Analyst" against the question it just asked; with several questions the text carries each question.
