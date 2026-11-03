import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/badge";

// A record's tags, each a link that shows only what carries it on this page.
export function TagList({
  tags,
  to,
}: {
  tags: string[];
  to: "/cockpit/inbox" | "/cockpit/tasks" | "/cockpit/notes";
}) {
  if (tags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="outline"
          className="text-muted-foreground"
          render={
            <Link
              to={to}
              search={(prev: Record<string, unknown>) => ({ ...prev, tag })}
              onClick={(event) => event.stopPropagation()}
            />
          }
        >
          #{tag}
        </Badge>
      ))}
    </span>
  );
}
