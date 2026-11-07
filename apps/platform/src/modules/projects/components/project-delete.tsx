import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/alert-dialog";
import { Button } from "@/components/button";

import { useCanManageProject } from "../hooks/use-can-manage-project";
import { useDeleteProject } from "../hooks/use-delete-project";
import type { Project } from "../types";

export function ProjectDelete({ project }: { project: Project }) {
  const canManage = useCanManageProject(project);
  const deleteProject = useDeleteProject();

  if (!canManage) return null;
  return (
    <div className="flex items-center justify-between gap-4 border-t px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">
        Remove it from Aven. The repository is untouched.
      </span>
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="destructive" size="sm" />}>
          Delete project
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The project leaves the list, its threads are archived and anything running in them is
              stopped, and its environment variables are erased. The repository on GitHub is
              untouched, and you can import it again later as a new project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void deleteProject(project)}>
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
