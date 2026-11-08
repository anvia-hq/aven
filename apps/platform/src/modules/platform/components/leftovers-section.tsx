import { Trash } from "@mynaui/icons-react";

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
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { SettingsList, SettingsRow, SettingsSection } from "@/components/settings-section";

import { useLeftovers } from "../hooks/use-leftovers";
import type { RunnerLeftovers } from "../types";

type Remove = (
  runner: RunnerLeftovers,
  request: { containers: string[]; images: string[] },
) => Promise<void>;

const countOf = (runner: RunnerLeftovers) => runner.containers.length + runner.images.length;

type Shared = { runner: RunnerLeftovers; onRemove: Remove; busy: boolean };

function RemoveAll({ runner, onRemove, busy }: Shared) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" size="sm" disabled={busy} />}>
        Remove all
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove everything listed for {runner.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {runner.containers.length} containers and {runner.images.length} images that nothing
            uses are deleted from that machine. Threads that are in use, and anything not listed
            here, are left alone. This cannot be undone, though an image Aven needs again is pulled
            or rebuilt when a thread asks for it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={() =>
              void onRemove(runner, {
                containers: runner.containers.map((container) => container.ref),
                images: runner.images.map((image) => image.ref),
              })
            }
          >
            Remove all
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Rows({ runner, onRemove, busy }: Shared) {
  return (
    <SettingsList label={`Leftovers of ${runner.name}`}>
      {runner.containers.map((container) => (
        <div key={container.ref} role="listitem" className="contents">
          <SettingsRow
            title={
              <>
                <span className="truncate font-mono">{container.name}</span>
                <Badge variant="outline">Container</Badge>
              </>
            }
            description={`${container.reason} · ${container.image} · created ${container.createdAt}`}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              aria-label={`Remove container ${container.name}`}
              onClick={() => void onRemove(runner, { containers: [container.ref], images: [] })}
            >
              <Trash />
            </Button>
          </SettingsRow>
        </div>
      ))}
      {runner.images.map((image) => (
        <div key={image.ref} role="listitem" className="contents">
          <SettingsRow
            title={
              <>
                <span className="truncate font-mono">{image.ref}</span>
                <Badge variant="outline">Image</Badge>
              </>
            }
            description={`${image.reason} · ${image.size} · created ${image.createdAt}`}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              aria-label={`Remove image ${image.ref}`}
              onClick={() => void onRemove(runner, { containers: [], images: [image.ref] })}
            >
              <Trash />
            </Button>
          </SettingsRow>
        </div>
      ))}
    </SettingsList>
  );
}

function Body({ runner, onRemove, busy }: Shared) {
  if (runner.status === "offline") {
    return <p className="text-sm text-muted-foreground">The runner is offline.</p>;
  }
  if (runner.status === "unsupported") {
    return (
      <p className="text-sm text-muted-foreground">
        This runner could not list its leftovers. It probably runs an older Aven: run aven update on
        its machine.
      </p>
    );
  }
  if (runner.status === "failed") {
    return (
      <p className="text-sm text-destructive">
        This runner could not list its leftovers: {runner.error}
      </p>
    );
  }
  if (countOf(runner) === 0) {
    return <p className="text-sm text-muted-foreground">Nothing is left over.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <RemoveAll runner={runner} onRemove={onRemove} busy={busy} />
      </div>
      <Rows runner={runner} onRemove={onRemove} busy={busy} />
    </div>
  );
}

export function LeftoversSection() {
  const { runners, error, refresh, remove, removing } = useLeftovers();

  return (
    <>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {runners?.length === 0 && (
        <p className="text-sm text-muted-foreground">There are no runners yet.</p>
      )}
      {runners?.map((runner) => (
        <SettingsSection
          key={runner.runtimeId}
          title={runner.name}
          description={runner.status === "ok" ? `${countOf(runner)} to remove` : undefined}
        >
          <Body runner={runner} onRemove={remove} busy={removing} />
        </SettingsSection>
      ))}
      {runners && (
        <div className="flex justify-start border-t pt-6">
          <Button variant="outline" size="sm" onClick={refresh}>
            Look again
          </Button>
        </div>
      )}
    </>
  );
}
