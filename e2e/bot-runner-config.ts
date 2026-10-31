// The runner the bots' computers are on in e2e (decision 0059). It is a row the e2e database is given
// when it is made, with no organization, so no list of runtimes shows it, and the control plane is
// told its id with `AVEN_BOT_RUNNER`. `e2e/bot-runner.ts` connects as it.
export const BOT_RUNNER_ID = "00000000-0000-4000-8000-0000000000b0";
export const BOT_RUNNER_TOKEN = "avrt_e2e-bots-runner-token";
export const BOT_RUNNER_HEALTH_PORT = 8103;
