import { useState } from "react";

import { toast } from "@aven/ui/toast";

import { handleOf } from "../activity";
import { renderProfileCapture } from "../components/profile-capture";
import type { ProfileStats } from "../types";

type ExportProfile = {
  name: string;
  email: string;
  image?: string | null;
  stats: ProfileStats | null;
};

export function useExportProfile() {
  const [exporting, setExporting] = useState(false);

  return {
    exporting,
    async exportProfile({ name, email, image, stats }: ExportProfile) {
      if (exporting) return;

      if (!stats) {
        toast.add({ title: "Your profile is still loading", type: "error" });
        return;
      }

      setExporting(true);

      try {
        const blob = await renderProfileCapture(name, email, image, stats);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${handleOf(name, email)}-profile-4x5.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        toast.add({ title: "Profile image downloaded", type: "success" });
      } catch (failure) {
        toast.add({
          title: "Could not download the profile image",
          description: failure instanceof Error ? failure.message : undefined,
          type: "error",
        });
      } finally {
        setExporting(false);
      }
    },
  };
}
