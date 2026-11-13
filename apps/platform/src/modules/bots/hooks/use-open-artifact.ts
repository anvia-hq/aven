import { useNavigate, useSearch } from "@tanstack/react-router";

export function useOpenArtifact() {
  const { artifact } = useSearch({ strict: false }) as { artifact?: string };
  const navigate = useNavigate();
  const show = (name: string | undefined) =>
    void navigate({
      to: ".",
      search: ((previous: Record<string, unknown>) => ({ ...previous, artifact: name })) as never,
      replace: true,
    });

  return { artifact, show };
}
