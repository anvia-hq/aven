import { ComputerTile } from "@/modules/computer/components/computer-tile";
import { ProjectTile } from "@/modules/projects/components/project-tile";
import { useRuntime } from "@/modules/runtimes/hooks/use-runtime";
import { isSandbox } from "@/modules/runtimes/sandbox";

type Props = {
  projectId: string;
  runtimeId: string;
  palette?: number;
  working?: boolean;
  speed?: number;
  decorative?: boolean;
  className?: string;
};

export function ThreadMark({ runtimeId, ...mark }: Props) {
  const { runtime } = useRuntime(runtimeId);
  const sandbox = !runtime || isSandbox(runtime);

  return sandbox ? <ProjectTile {...mark} /> : <ComputerTile {...mark} />;
}
