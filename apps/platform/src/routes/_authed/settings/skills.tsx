import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { SkillsList } from "@/modules/skills/components/skills-list";

export const Route = createFileRoute("/_authed/settings/skills")({
  component: Skills,
});

function Skills() {
  return (
    <SettingsPage
      title="Skills"
      description="Instructions for particular kinds of task. The agent sees each skill's name and description, and reads the rest in its sandbox, in /skills, when a task calls for it."
    >
      <SkillsList />
    </SettingsPage>
  );
}
