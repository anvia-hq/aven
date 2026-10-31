import { createQuestionTool } from "@anvia/core";
import { SECRET_TOOL_NAME } from "@aven/protocol/events";

const DESCRIPTION = `Ask the user for a secret you need (an API key, a token, a password) without it appearing in the conversation. The run waits while the user types it into a private, masked form; you never see the value.

Use this tool, and never ask_user or a message, whenever you need a secret you do not have. Check first that it is not already set: the project's environment variables are listed in your instructions.

How to ask:
- Give each question an \`id\` that is the name of the environment variable to set, in UPPER_SNAKE_CASE, such as STRIPE_API_KEY. It becomes that variable.
- Write \`text\` as a short, complete request that says what the value is for and, if you know it, where to find it. Do not include choices; leave allowCustom off.
- Ask for everything you need in one call, no more than 4.

After you get the answers:
- Each answer says \`stored as NAME\` or that nothing was provided. The value is now in your commands' environment as $NAME: use it by name, and never print it or write it into a file, a commit or a message.
- If it was not provided, carry on without it or tell the user what is blocked.`;

/** `request_secret` (decision 0047): a question whose answer is stored as a secret variable, not given to the agent. */
export function createSecretRequestTool() {
  return createQuestionTool({ name: SECRET_TOOL_NAME, description: DESCRIPTION });
}
