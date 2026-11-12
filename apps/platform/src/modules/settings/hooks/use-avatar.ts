import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { toast } from "@/components/toast";
import { api, attempt } from "@/lib/api";

import { squareAvatar } from "../resize-image";

export function useAvatar() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function saved(title: string) {
    await router.invalidate();
    toast.add({ title, type: "success" });
  }

  async function upload(file: File) {
    setBusy(true);
    const stored = await attempt("Could not save the photo", async () => {
      const image = await squareAvatar(file);
      return api<{ image: string }>("/profile/avatar", {
        method: "PUT",
        headers: { "content-type": image.type },
        body: image,
      });
    });
    setBusy(false);

    if (stored) await saved("Photo saved");
  }

  async function remove() {
    setBusy(true);
    const removed = await attempt("Could not remove the photo", () =>
      api<{ image: null }>("/profile/avatar", { method: "DELETE" }),
    );
    setBusy(false);

    if (removed) await saved("Photo removed");
  }

  return { busy, upload, remove };
}
