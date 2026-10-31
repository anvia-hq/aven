import { unzipSync } from "fflate";
import { useAtom } from "jotai";
import { useEffect } from "react";

import { toast } from "@/components/toast";
import { api, attempt, postJson } from "@/lib/api";
import { fileSize } from "@/lib/format";
import { createListStore } from "@/lib/list-store";

import { builtinSkillsAtom, skillsAtom } from "../atoms/skills-atom";
import type { BuiltinSkill, Skill, SkillUploadFile } from "../types";

// The control plane's limits for one skill (decision 0035), checked here first to say so sooner.
const MAX_FILES = 200;
const MAX_BYTES = 5 * 1024 * 1024;

class UploadRefused extends Error {}

function base64Of(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read a file"));
    reader.readAsDataURL(blob);
  });
}

function checkLimits(count: number, bytes: number) {
  if (count > MAX_FILES) throw new UploadRefused(`A skill can have at most ${MAX_FILES} files`);
  if (bytes > MAX_BYTES) throw new UploadRefused(`A skill can be at most ${fileSize(MAX_BYTES)}`);
}

// The files of a skill as picked: one .zip, unpacked here, or a folder's files with their paths.
async function readUpload(picked: File[]): Promise<SkillUploadFile[]> {
  const [only] = picked;
  if (picked.length === 1 && only && /\.zip$/i.test(only.name)) {
    let total = 0;
    let count = 0;
    const entries = unzipSync(new Uint8Array(await only.arrayBuffer()), {
      // Sizes as the zip states them, so a bomb is refused before it is inflated.
      filter: (file) => {
        if (file.name.endsWith("/")) return false;
        total += file.originalSize;
        count += 1;
        checkLimits(count, total);
        return true;
      },
    });
    return Promise.all(
      Object.entries(entries).map(async ([path, bytes]) => ({
        path,
        data: await base64Of(new Blob([bytes])),
      })),
    );
  }
  checkLimits(
    picked.length,
    picked.reduce((sum, file) => sum + file.size, 0),
  );
  return Promise.all(
    picked.map(async (file) => ({
      // A folder's files carry their path in it; a lone file has only its name.
      path: file.webkitRelativePath || file.name,
      data: await base64Of(file),
    })),
  );
}

const skillsStore = createListStore<Skill>({ path: "/skills", atom: skillsAtom, label: "skills" });
const builtinStore = createListStore<BuiltinSkill>({
  path: "/skills/built-in",
  atom: builtinSkillsAtom,
  label: "built-in skills",
});

// Skills belong to the signed-in user, so drop them on sign-out; the next user refetches.
export function resetSkills() {
  skillsStore.reset();
}

// The user's skills and the built-in ones. Loads on first use; mutations refetch.
export function useSkills() {
  const [skills] = useAtom(skillsAtom);
  const [builtIn] = useAtom(builtinSkillsAtom);
  const { refresh } = skillsStore;

  useEffect(() => {
    if (skills === null) void refresh();
  }, [skills, refresh]);

  useEffect(() => {
    if (builtIn === null) void builtinStore.refresh();
  }, [builtIn]);

  // Runs a request that changes a skill and reloads the list; false on failure (already toasted).
  async function change(failureTitle: string, request: () => Promise<unknown>) {
    const changed = await attempt(failureTitle, async () => {
      await request();
      return true;
    });
    if (!changed) return false;
    await refresh();
    return true;
  }

  async function upload(picked: File[]) {
    if (picked.length === 0) return false;
    let files: SkillUploadFile[];
    try {
      files = await readUpload(picked);
    } catch (failure) {
      const description =
        failure instanceof UploadRefused ? failure.message : "The files could not be read";
      toast.add({ title: "Could not upload skill", description, type: "error" });
      return false;
    }
    const saved = await attempt("Could not upload skill", () =>
      postJson<Skill>("/skills", { files }),
    );
    if (!saved) return false;
    await refresh();
    toast.add({ title: "Skill uploaded", description: saved.name, type: "success" });
    return true;
  }

  function setEnabled(skill: Skill, enabled: boolean) {
    return change("Could not update skill", () =>
      postJson<Skill>(`/skills/${skill.id}`, { enabled }, "PATCH"),
    );
  }

  async function remove(skill: Skill) {
    const removed = await change("Could not remove skill", () =>
      api<{ ok: true }>(`/skills/${skill.id}`, { method: "DELETE" }),
    );
    if (removed) toast.add({ title: "Skill removed", description: skill.name });
  }

  return {
    builtIn: builtIn ?? [],
    personal: skills ?? [],
    loaded: skills !== null && builtIn !== null,
    upload,
    setEnabled,
    remove,
  };
}
