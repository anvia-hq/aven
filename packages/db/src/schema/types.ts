import type { accounts } from "./accounts";
import type { botGoals } from "./bot-goals";
import type { botSchedules } from "./bot-schedules";
import type { botThreads } from "./bot-threads";
import type { bots } from "./bots";
import type { claudeSetupTokens } from "./claude-setup-tokens";
import type { cockpitInboxItems } from "./cockpit-inbox-items";
import type { cockpitNotes } from "./cockpit-notes";
import type { cockpitTags } from "./cockpit-tags";
import type { cockpitTasks } from "./cockpit-tasks";
import type { codexLogins } from "./codex-logins";
import type { decisionModels } from "./decision-models";
import type { environmentVariables } from "./environment-variables";
import type { githubApps } from "./github-apps";
import type { githubInstallations } from "./github-installations";
import type { githubUserTokens } from "./github-user-tokens";
import type { invitations } from "./invitations";
import type { mcpServers } from "./mcp-servers";
import type { members } from "./members";
import type { memoryEvents } from "./memory-events";
import type { memoryNotes } from "./memory-notes";
import type { organizations } from "./organizations";
import type { platformSettings } from "./platform-settings";
import type { projects } from "./projects";
import type { providers } from "./providers";
import type { runtimes } from "./runtimes";
import type { sessions } from "./sessions";
import type { skills } from "./skills";
import type { threads } from "./threads";
import type { users } from "./users";
import type { variableEvents } from "./variable-events";
import type { verifications } from "./verifications";

export type Account = typeof accounts.$inferSelect;

export type BotGoalRow = typeof botGoals.$inferSelect;

export type BotScheduleRow = typeof botSchedules.$inferSelect;

export type BotThreadRow = typeof botThreads.$inferSelect;

export type BotRow = typeof bots.$inferSelect;

export type ClaudeSetupTokenRow = typeof claudeSetupTokens.$inferSelect;

export type CockpitInboxItemRow = typeof cockpitInboxItems.$inferSelect;

export type CockpitNoteRow = typeof cockpitNotes.$inferSelect;

export type CockpitTagRow = typeof cockpitTags.$inferSelect;

export type CockpitTaskRow = typeof cockpitTasks.$inferSelect;

export type CodexLoginRow = typeof codexLogins.$inferSelect;

export type EnvironmentVariableRow = typeof environmentVariables.$inferSelect;

export type NewEnvironmentVariableRow = typeof environmentVariables.$inferInsert;

export type GithubAppRow = typeof githubApps.$inferSelect;

export type GithubInstallation = typeof githubInstallations.$inferSelect;

export type NewGithubInstallation = typeof githubInstallations.$inferInsert;

export type GithubUserTokenRow = typeof githubUserTokens.$inferSelect;

export type Invitation = typeof invitations.$inferSelect;

export type NewInvitation = typeof invitations.$inferInsert;

export type McpServerRow = typeof mcpServers.$inferSelect;

export type Member = typeof members.$inferSelect;

export type NewMember = typeof members.$inferInsert;

export type MemoryEventRow = typeof memoryEvents.$inferSelect;

export type MemoryNoteRow = typeof memoryNotes.$inferSelect;

export type Organization = typeof organizations.$inferSelect;

export type NewOrganization = typeof organizations.$inferInsert;

export type PlatformSetting = typeof platformSettings.$inferSelect;

export type NewPlatformSetting = typeof platformSettings.$inferInsert;

export type Project = typeof projects.$inferSelect;

export type NewProject = typeof projects.$inferInsert;

export type ProviderRow = typeof providers.$inferSelect;

export type NewProviderRow = typeof providers.$inferInsert;

export type RuntimeRow = typeof runtimes.$inferSelect;

export type NewRuntimeRow = typeof runtimes.$inferInsert;

export type Session = typeof sessions.$inferSelect;

export type SkillRow = typeof skills.$inferSelect;

export type Thread = typeof threads.$inferSelect;

export type NewThread = typeof threads.$inferInsert;

export type User = typeof users.$inferSelect;

export type NewUser = typeof users.$inferInsert;

export type VariableEventRow = typeof variableEvents.$inferSelect;

export type NewVariableEventRow = typeof variableEvents.$inferInsert;

export type Verification = typeof verifications.$inferSelect;

export type DecisionModelRow = typeof decisionModels.$inferSelect;
