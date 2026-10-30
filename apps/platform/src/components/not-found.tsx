import { Link } from "@tanstack/react-router";

type Props = {
  title: string;
  /** Where to go instead, and what the link says. */
  to: "/threads" | "/projects";
  back: string;
  as?: "div" | "main";
};

// A full-height screen for something that does not exist (or is not the user's), with a way back.
export function NotFound({ title, to, back, as: Root = "div" }: Props) {
  return (
    <Root className="flex min-h-svh flex-col items-center justify-center gap-2">
      <h1 className="text-xl font-semibold">{title}</h1>
      <Link to={to} className="text-sm text-muted-foreground underline">
        {back}
      </Link>
    </Root>
  );
}
