import { SQL } from "bun";

const DAY = 86_400_000;

const message = (tokens: number) => ({
  role: "assistant",
  content: "done",
  metadata: {
    anvia: {
      generation: {
        provider: "anthropic",
        modelId: "claude-sonnet-4",
        usage: {
          inputTokens: tokens - 10,
          outputTokens: 10,
          totalTokens: tokens,
          cachedInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
    },
  },
});

const [email, tokensArg, daysArg] = process.argv.slice(2);
const url = process.env.E2E_DATABASE_URL;

if (!email || !url) throw new Error("Usage: seed-spending.ts <email> [tokens] [days ago,…]");

const tokens = Number(tokensArg ?? 1_000);
const daysAgo = (daysArg ?? "0,1,2").split(",").map(Number);

const sql = new SQL(url);
const [person] = await sql`select id from users where email = ${email}`;

if (!person) throw new Error(`No person with the email ${email}`);

const sessionId = crypto.randomUUID();
const [session] = await sql`insert into agent_memory_sessions (scope_key, session_id, user_id)
    values (${`spent-${sessionId}`}, ${sessionId}, ${person.id}) returning id`;

for (const [position, ago] of daysAgo.entries()) {
  await sql`insert into agent_memory_messages
    (memory_session_id, run_id, turn, position, role, message, created_at)
    values (${session.id}, ${"run"}, ${0}, ${position}, ${"assistant"},
      ${JSON.stringify(message(tokens))}::text::jsonb, ${new Date(Date.now() - ago * DAY)})`;
}

await sql.close();
