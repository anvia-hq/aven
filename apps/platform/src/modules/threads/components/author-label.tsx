import { Avatar, AvatarFallback } from "@aven/ui/avatar";
import { initials } from "@/lib/format";

export function AuthorLabel({ name }: { name: string }) {
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground" data-role="driver">
      <Avatar size="sm">
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>
      {name}
    </p>
  );
}
