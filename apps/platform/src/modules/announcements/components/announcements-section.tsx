import { Trash } from "@mynaui/icons-react";
import { useState } from "react";

import { cn } from "cn";

import { Form } from "@aven/ui/form";
import { Label } from "@aven/ui/label";
import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import {
  SettingsEmpty,
  SettingsList,
  SettingsRow,
  SettingsSection,
} from "@/components/settings-section";
import { Switch } from "@aven/ui/switch";
import { Textarea } from "@aven/ui/textarea";
import { TextField } from "@aven/ui/text-field";

import { useAnnouncements } from "../hooks/use-announcements";
import { ANNOUNCEMENT_TEMPLATES, templateBackground } from "../templates";
import type { Announcement, AnnouncementDraft } from "../types";
import { AnnouncementCard } from "./announcement-card";

const EMPTY: AnnouncementDraft = {
  title: "",
  summary: "",
  details: "",
  template: "waves",
  active: true,
};

const draftOf = ({
  title,
  summary,
  details,
  template,
  active,
}: Announcement): AnnouncementDraft => ({
  title,
  summary,
  details,
  template,
  active,
});

export function AnnouncementsSection() {
  const { announcements, error, save, setActive, remove } = useAnnouncements();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<AnnouncementDraft>(EMPTY);
  const ready = draft.title.trim() !== "" && draft.summary.trim() !== "";

  function reset() {
    setEditing(null);
    setDraft(EMPTY);
  }

  function edit(announcement: Announcement) {
    setEditing(announcement.id);
    setDraft(draftOf(announcement));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    if (await save(editing, draft)) reset();
  }

  return (
    <>
      <SettingsSection
        title={editing ? "Edit announcement" : "New announcement"}
        description="Shown as a card in every sidebar. Clicking it opens the details."
      >
        <Form onSubmit={submit} className="flex flex-col gap-4">
          <TextField
            label="Title"
            value={draft.title}
            maxLength={60}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
          <TextField
            label="Summary"
            value={draft.summary}
            maxLength={160}
            onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
          />
          <Label className="flex-col items-start gap-1 font-normal">
            Details (markdown, shown in the dialog)
            <Textarea
              value={draft.details}
              maxLength={4000}
              onChange={(event) => setDraft({ ...draft, details: event.target.value })}
            />
          </Label>
          <div role="group" aria-label="Background" className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap gap-2">
              {ANNOUNCEMENT_TEMPLATES.map((template) => (
                <Button
                  variant="ghost"
                  type="button"
                  key={template.key}
                  aria-label={template.label}
                  aria-pressed={draft.template === template.key}
                  title={template.label}
                  onClick={() => setDraft({ ...draft, template: template.key })}
                  className={cn(
                    "h-12 w-20 cursor-pointer rounded-lg bg-cover bg-center ring-offset-2 ring-offset-background",
                    draft.template === template.key ? "ring-2 ring-foreground" : "opacity-70",
                  )}
                  style={{ backgroundImage: templateBackground(template.key) }}
                />
              ))}
            </div>
          </div>
          <Label className="font-normal">
            <Switch
              aria-label="Active"
              checked={draft.active}
              onCheckedChange={(active) => setDraft({ ...draft, active })}
            />
            Show to everyone now (replaces the current one)
          </Label>
          <AnnouncementCard
            title={draft.title}
            summary={draft.summary}
            template={draft.template}
            className="max-w-sm"
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={!ready}>
              {editing ? "Save changes" : "Publish"}
            </Button>
            {editing && (
              <Button type="button" variant="ghost" onClick={reset}>
                Cancel
              </Button>
            )}
          </div>
        </Form>
      </SettingsSection>
      <SettingsSection title="All announcements">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {announcements?.length === 0 && <SettingsEmpty>No announcements yet.</SettingsEmpty>}
        {announcements && announcements.length > 0 && (
          <SettingsList label="Announcements">
            {announcements.map((announcement) => (
              <div key={announcement.id} role="listitem" className="contents">
                <SettingsRow
                  title={
                    <>
                      {announcement.title}
                      {announcement.active && <Badge variant="secondary">Live</Badge>}
                    </>
                  }
                  description={announcement.summary}
                >
                  <Switch
                    aria-label={`Show ${announcement.title}`}
                    checked={announcement.active}
                    onCheckedChange={(active) => void setActive(announcement, active)}
                  />
                  <Button variant="ghost" size="sm" onClick={() => edit(announcement)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${announcement.title}`}
                    onClick={() => void remove(announcement)}
                  >
                    <Trash />
                  </Button>
                </SettingsRow>
              </div>
            ))}
          </SettingsList>
        )}
      </SettingsSection>
    </>
  );
}
