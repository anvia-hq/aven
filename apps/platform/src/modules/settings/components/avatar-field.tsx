import { useRef } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/avatar";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { initials } from "@/lib/format";

import { useAvatar } from "../hooks/use-avatar";

type Props = { name: string; image: string | null };

export function AvatarField({ name, image }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const { busy, upload, remove } = useAvatar();

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16">
        {image && <AvatarImage src={image} alt="" />}
        <AvatarFallback className="text-lg">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col items-start gap-2">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {image ? "Change photo" : "Upload photo"}
          </Button>
          {image && (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={remove}>
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          PNG, JPEG or WebP. It is cropped to a square.
        </p>
      </div>
      <Input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Photo"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";

          if (file) void upload(file);
        }}
      />
    </div>
  );
}
