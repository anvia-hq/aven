import { createTool } from "@anvia/core";
import { BOT_AVATAR_MAX, BOT_INSTRUCTION_MAX, BOT_NAME_MAX } from "@aven/protocol/bots";
import { z } from "zod";

export const CREATE_BOT_TOOL_NAME = "create_bot";

export const createBotSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(BOT_NAME_MAX)
    .describe("The new bot's name: short, as a person would call it, such as `Scout`."),
  instruction: z
    .string()
    .trim()
    .min(1)
    .max(BOT_INSTRUCTION_MAX)
    .describe(
      "What the new bot is for and how it should work and talk, written to the bot in the second person: `You research topics the person gives you...`. The bot has a computer of its own; say so when its job needs one.",
    ),
  avatar: z
    .string()
    .trim()
    .max(BOT_AVATAR_MAX)
    .optional()
    .describe("One emoji for the bot's avatar; leave it out for none."),
});

export type NewBotInput = z.infer<typeof createBotSchema>;

/** What the host does to make the bot (decision 0060); it says who it made. */
export type CreateBot = (input: NewBotInput) => Promise<{ name: string }>;

// How the person's main bot makes another bot. What making one takes, a place to keep it and the
// person's permission, is the host's.
export function createCreateBotTool(createBot: CreateBot) {
  return createTool({
    name: CREATE_BOT_TOOL_NAME,
    description:
      "Make a new bot for the person, with a name and an instruction of its own. It appears in the person's list of bots, ready to talk to, and works on the person's default model. Use it only when the person asks for a new bot.",
    inputSchema: createBotSchema,
    async execute(input) {
      const { name } = await createBot(input);
      return { created: true, name };
    },
  });
}
