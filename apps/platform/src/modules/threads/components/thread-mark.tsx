import { ComputerTile } from "@/modules/computer/components/computer-tile";
import { ProjectTile } from "@/modules/projects/components/project-tile";
import { markColors } from "@/modules/projects/orb-art";
import { useRuntime } from "@/modules/runtimes/hooks/use-runtime";
import { isSandbox } from "@/modules/runtimes/sandbox";

type Props = {
  projectId: string;
  runtimeId: string;
  palette?: number;
  color?: string | null;
  working?: boolean;
  speed?: number;
  decorative?: boolean;
  className?: string;
};

export function ThreadMark({ runtimeId, color, ...mark }: Props) {
  const { runtime } = useRuntime(runtimeId);
  const sandbox = !runtime || isSandbox(runtime);
  const colors = color ? markColors(color) : undefined;

  return sandbox ? (
    <ProjectTile {...mark} colors={colors} />
  ) : (
    <ComputerTile {...mark} colors={colors} />
  );
}
