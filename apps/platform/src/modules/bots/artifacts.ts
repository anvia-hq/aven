import type { ArtifactFile, ArtifactGroup, ArtifactKind, BotChatMessage } from "./types";

const KINDS: Record<string, ArtifactKind> = {
  "application/pdf": "pdf",
  "text/markdown": "markdown",
  "text/csv": "csv",
  "text/plain": "text",
  "text/html": "page",
};

export function kindOf(mediaType: string): ArtifactKind {
  if (mediaType.startsWith("image/")) return "image";

  if (mediaType.startsWith("video/")) return "video";

  return KINDS[mediaType] ?? "text";
}

export const titleOf = (artifact: { title?: string | undefined; name: string }) =>
  artifact.title ?? artifact.name;

export function downloadName(artifact: { title?: string | undefined; name: string }) {
  const extension = artifact.name.slice(artifact.name.lastIndexOf(".") + 1);
  const title = titleOf(artifact);

  return title.toLowerCase().endsWith(`.${extension}`) ? title : `${title}.${extension}`;
}

export const artifactSource = (botId: string, name: string) =>
  `/api/bots/${botId}/artifacts/${name}`;

export function artifactGroups(messages: readonly BotChatMessage[]): ArtifactGroup[] {
  const groups = new Map<string, ArtifactFile[]>();
  for (const message of messages) {
    for (const artifact of message.artifacts ?? []) {
      const title = titleOf(artifact);
      const versions = groups.get(title) ?? [];
      versions.push({ ...artifact, title, messageId: message.id });
      groups.set(title, versions);
    }
  }
  return [...groups].map(([title, versions]) => ({ title, versions: versions.toReversed() }));
}

export function findArtifact(groups: readonly ArtifactGroup[], name: string | undefined) {
  if (!name) return undefined;

  for (const group of groups) {
    const index = group.versions.findIndex((version) => version.name === name);

    if (index !== -1)
      return { group, version: group.versions[index]!, number: group.versions.length - index };
  }

  return undefined;
}
