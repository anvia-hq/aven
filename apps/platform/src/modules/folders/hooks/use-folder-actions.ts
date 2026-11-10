import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/toast";
import { api, errorMessage, postJson } from "@/lib/api";

import { withFolder, withMove, withOpen, withoutFolder, withRename } from "../folder-cache";
import type { Folder, FolderOpen, FolderRename, NewFolder, ThreadMove } from "../types";
import { useFoldersKey } from "./use-folders";

const WRITE_KEY = ["folders", "write"] as const;

function moveRequest({ threadId, folderId }: ThreadMove) {
  return postJson<ThreadMove>(`/folders/threads/${threadId}`, { folderId }, "PUT");
}

function useFolderMutation<Variables>({
  request,
  patch,
  failure,
}: {
  request: (variables: Variables) => Promise<unknown>;
  patch: (folders: Folder[], variables: Variables) => Folder[];
  failure: string;
}) {
  const client = useQueryClient();
  const queryKey = useFoldersKey();
  return useMutation({
    mutationKey: WRITE_KEY,
    mutationFn: request,
    onMutate: async (variables: Variables) => {
      await client.cancelQueries({ queryKey });
      const snapshot = client.getQueryData<Folder[]>(queryKey);
      client.setQueryData<Folder[]>(queryKey, (current) => patch(current ?? [], variables));
      return { snapshot };
    },
    onError: (error, _variables, context) => {
      client.setQueryData(queryKey, context?.snapshot);
      toast.add({ title: failure, description: errorMessage(error), type: "error" });
    },
    onSettled: () => {
      if (client.isMutating({ mutationKey: WRITE_KEY }) <= 1) {
        void client.invalidateQueries({ queryKey });
      }
    },
  });
}

export function useFolderActions() {
  const create = useFolderMutation<NewFolder>({
    request: async ({ name, threadId }) => {
      const folder = await postJson<Folder>("/folders", { name });
      if (threadId) await moveRequest({ threadId, folderId: folder.id });
      return folder;
    },
    patch: withFolder,
    failure: "Could not create the folder",
  });
  const rename = useFolderMutation<FolderRename>({
    request: ({ id, name }) => postJson<Folder>(`/folders/${id}`, { name }, "PATCH"),
    patch: withRename,
    failure: "Could not rename the folder",
  });
  const setOpen = useFolderMutation<FolderOpen>({
    request: ({ id, open }) => postJson<Folder>(`/folders/${id}`, { open }, "PATCH"),
    patch: withOpen,
    failure: "Could not save the folder",
  });
  const remove = useFolderMutation<string>({
    request: (id) => api(`/folders/${id}`, { method: "DELETE" }),
    patch: withoutFolder,
    failure: "Could not delete the folder",
  });
  const move = useFolderMutation<ThreadMove>({
    request: moveRequest,
    patch: withMove,
    failure: "Could not move the thread",
  });

  return {
    create: (variables: NewFolder) => create.mutate(variables),
    rename: (variables: FolderRename) => rename.mutate(variables),
    setOpen: (variables: FolderOpen) => setOpen.mutate(variables),
    remove: (id: string) => remove.mutate(id),
    move: (variables: ThreadMove) => move.mutate(variables),
  };
}
