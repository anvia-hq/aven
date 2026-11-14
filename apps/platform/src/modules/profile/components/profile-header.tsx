import { Download, Pencil } from "@mynaui/icons-react";
import { useNavigate } from "@tanstack/react-router";

import { Avatar, AvatarFallback, AvatarImage } from "@aven/ui/avatar";
import { Button } from "@aven/ui/button";
import { Spinner } from "@aven/ui/spinner";
import { initials } from "@/lib/format";

import { handleOf } from "../activity";
import { useExportProfile } from "../hooks/use-export-profile";
import type { ProfileStats } from "../types";

type Props = {
  name: string;
  email: string;
  image?: string | null;
  stats: ProfileStats | null;
};

export function ProfileHeader({ name, email, image, stats }: Props) {
  const navigate = useNavigate();
  const { exporting, exportProfile } = useExportProfile();

  return (
    <header className="relative isolate flex flex-wrap items-center justify-between gap-4">
      <div className="pointer-events-none absolute -top-24 left-0 -z-10 h-48 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="flex min-w-0 items-center gap-4">
        <Avatar className="size-16 ring-1 ring-border ring-offset-2 ring-offset-background">
          {image && <AvatarImage src={image} alt="" />}
          <AvatarFallback className="bg-gradient-to-br from-primary/25 to-primary/5 text-lg font-medium text-foreground">
            {initials(name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{name}</h1>
          <p className="truncate text-sm text-muted-foreground">@{handleOf(name, email)}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={exporting || stats === null}
          onClick={() => void exportProfile({ name, email, image, stats })}
        >
          {exporting ? <Spinner /> : <Download />}
          {exporting ? "Downloading" : "Download PNG"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void navigate({ to: "/settings/general" })}
        >
          <Pencil />
          Edit profile
        </Button>
      </div>
    </header>
  );
}
