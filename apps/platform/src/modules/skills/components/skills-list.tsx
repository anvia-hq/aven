import { IconArchive, IconCheck, IconDownload, IconFolder, IconTrash } from "@tabler/icons-react";
import { useRef, useState, type DragEvent } from "react";

import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import { Form } from "@aven/ui/form";
import { Input } from "@aven/ui/input";
import { SettingsSection } from "@aven/ui/settings-section";
import { Switch } from "@aven/ui/switch";
import { fileSize } from "@/lib/format";

import { useSkills } from "../hooks/use-skills";
import type { Skill, SkillChoice } from "../types";

const folderPicker = { webkitdirectory: "" } as Record<string, string>;

function InstallSkill() {
  const { install } = useSkills();
  const [source, setSource] = useState("");
  const [choices, setChoices] = useState<SkillChoice[]>([]);
  const [installed, setInstalled] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function find() {
    if (busy || source.trim().length === 0) return;

    setBusy(true);
    setInstalled([]);
    try {
      const found = await install(source);
      setChoices(found?.status === "choose" ? found.choices : []);
    } finally {
      setBusy(false);
    }
  }

  async function pick(choice: SkillChoice) {
    if (busy) return;

    setBusy(true);
    try {
      const added = await install(source, choice.folder);

      if (added?.status === "installed") setInstalled((folders) => [...folders, choice.folder]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 border-t pt-3">
      <Form
        className="flex w-full max-w-xl gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void find();
        }}
      >
        <Input
          aria-label="A skill to install"
          placeholder="vercel-labs/agent-skills@web-design-guidelines"
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
            setChoices([]);
            setInstalled([]);
          }}
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={busy || source.trim().length === 0}
        >
          <IconDownload />
          Install
        </Button>
      </Form>
      {choices.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            That repository has {choices.length} skills. Install the ones you want:
          </p>
          <div className="flex flex-wrap gap-2">
            {choices.map((choice) => (
              <Button
                key={choice.folder}
                size="sm"
                variant="outline"
                disabled={busy || installed.includes(choice.folder)}
                onClick={() => void pick(choice)}
              >
                {installed.includes(choice.folder) ? <IconCheck /> : null}
                {choice.name}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UploadSkill() {
  const { upload } = useSkills();
  const folder = useRef<HTMLInputElement>(null);
  const zip = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(files: FileList | null) {
    if (!files || busy) return;

    setBusy(true);
    try {
      await upload([...files]);
    } finally {
      setBusy(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    setDragging(false);

    if (event.dataTransfer.files.length === 0) return;

    event.preventDefault();
    void send(event.dataTransfer.files);
  }

  return (
    <div
      className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4 data-[dragging]:border-ring data-[dragging]:bg-accent/40"
      data-dragging={dragging || undefined}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;

        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <p className="text-xs text-muted-foreground">
        A skill is a folder with a <code className="font-mono">SKILL.md</code>, and optionally{" "}
        <code className="font-mono">references/</code> and{" "}
        <code className="font-mono">scripts/</code>. Upload the folder, or drop a .zip of it here,
        or install one from a link to GitHub or skills.sh. A skill with the same name replaces one
        you have.
      </p>
      <div className="flex gap-2">
        <Input
          ref={folder}
          type="file"
          hidden
          {...folderPicker}
          onChange={(event) => {
            void send(event.target.files);
            event.target.value = "";
          }}
        />
        <Input
          ref={zip}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(event) => {
            void send(event.target.files);
            event.target.value = "";
          }}
        />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => folder.current?.click()}>
          <IconFolder />
          Upload folder
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => zip.current?.click()}>
          <IconArchive />
          Upload .zip
        </Button>
      </div>
      <InstallSkill />
    </div>
  );
}

function PersonalSkill({ skill }: { skill: Skill }) {
  const { setEnabled, remove } = useSkills();
  return (
    <li className="flex items-start gap-3 border-b py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-mono text-sm font-medium">{skill.name}</span>
        <p className="line-clamp-2 text-xs text-muted-foreground">{skill.description}</p>
        <p className="text-xs text-muted-foreground">
          {skill.fileCount === 1 ? "1 file" : `${skill.fileCount} files`} · {fileSize(skill.size)}
        </p>
      </div>
      <Switch
        size="sm"
        aria-label={`Use ${skill.name}`}
        checked={skill.enabled}
        onCheckedChange={(enabled) => void setEnabled(skill, enabled)}
      />
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${skill.name}`}
        onClick={() => remove(skill)}
      >
        <IconTrash />
      </Button>
    </li>
  );
}

export function SkillsList() {
  const { builtIn, personal, loaded } = useSkills();

  if (!loaded) return null;

  const replaced = new Set(personal.flatMap((skill) => (skill.enabled ? [skill.name] : [])));

  return (
    <>
      <SettingsSection
        title="Yours"
        description="Every thread you send a message in has these, in any workspace."
      >
        <div className="flex flex-col gap-4">
          <UploadSkill />
          {personal.length > 0 && (
            <ul className="flex flex-col">
              {personal.map((skill) => (
                <PersonalSkill key={skill.id} skill={skill} />
              ))}
            </ul>
          )}
        </div>
      </SettingsSection>
      <SettingsSection
        title="Built-in"
        description="Every thread has these. One of yours with the same name takes its place."
      >
        <ul className="flex flex-col">
          {builtIn.map((skill) => (
            <li key={skill.name} className="flex items-start gap-3 border-b py-3 last:border-b-0">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-mono text-sm font-medium">{skill.name}</span>
                <p className="line-clamp-2 text-xs text-muted-foreground">{skill.description}</p>
              </div>
              {replaced.has(skill.name) && <Badge variant="secondary">Replaced by yours</Badge>}
            </li>
          ))}
        </ul>
      </SettingsSection>
      <SettingsSection
        title="Repository"
        description="A project's own skills, for every thread of it."
      >
        <p className="text-sm text-muted-foreground">
          Put them in <code className="font-mono">.aven/skills/&lt;name&gt;/SKILL.md</code> in the
          repository. They take the place of a skill of yours or a built-in one with the same name.
        </p>
      </SettingsSection>
    </>
  );
}
