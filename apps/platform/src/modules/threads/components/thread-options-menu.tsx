import {
  IconBolt,
  IconCheck,
  IconCopy,
  IconCpu,
  IconDots,
  IconDownload,
  IconPencil,
  IconShare,
} from "@tabler/icons-react";
import type { ReactElement } from "react";
import { useRef } from "react";

import { cn } from "cn";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@aven/ui/dropdown-menu";
import { toast } from "@aven/ui/toast";

import { copyToClipboard } from "@/lib/clipboard";

import { useExportThread } from "../hooks/use-export-thread";
import { useModelSelection } from "../hooks/use-model-selection";
import { useThreadColors } from "../hooks/use-thread-colors";
import { THREAD_COLORS } from "../thread-colors";
import type { Thread } from "../types";
import { effortName } from "./effort-slider";

type Props = {
  thread: Thread;
  trigger: ReactElement;
  canRun: boolean;
  canColor: boolean;
  align?: "start" | "end";
  onShare?: () => void;
  onRename?: () => void;
};

function ThreadRunChoices({ thread }: { thread: Thread }) {
  const model = useModelSelection(thread.id, thread.agentBackend);

  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="[&>svg:last-child]:ml-0">
          <IconCpu />
          Model
          <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
            {model.modelLabel ?? model.provider?.name ?? ""}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-72 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto">
          {model.choices.length === 0 ? (
            <DropdownMenuItem disabled>No models</DropdownMenuItem>
          ) : (
            model.providers.flatMap((provider) => {
              const choices = model.choices.filter((choice) => choice.provider.id === provider.id);

              if (choices.length === 0) return [];

              return [
                <DropdownMenuGroup key={provider.id}>
                  <DropdownMenuLabel>{provider.name}</DropdownMenuLabel>
                  {choices.map((choice) => {
                    const chosen =
                      choice.provider.id === model.provider?.id && choice.modelId === model.modelId;

                    return (
                      <DropdownMenuItem
                        key={`${choice.provider.id}:${choice.modelId}`}
                        title={choice.label}
                        onClick={() => model.selectModel(choice)}
                      >
                        <span className="min-w-0 flex-1 truncate">{choice.label}</span>
                        {chosen && <IconCheck />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuGroup>,
              ];
            })
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      {model.levels.length > 1 && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="[&>svg:last-child]:ml-0">
            <IconBolt />
            Reasoning
            <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">
              {effortName(model.effort)}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            {model.levels.map((level) => (
              <DropdownMenuItem key={level} onClick={() => model.selectEffort(level)}>
                {effortName(level)}
                {level === model.effort && <IconCheck className="ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
    </>
  );
}

function ThreadColor({ thread }: { thread: Thread }) {
  const colors = useThreadColors();

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger title="The thread's mark and title color">
        <span className="flex size-4 shrink-0 items-center justify-center">
          <span
            className={cn(
              "size-3 rounded-full border",
              thread.markColor ? "border-transparent" : "border-muted-foreground/50",
            )}
            style={thread.markColor ? { backgroundColor: thread.markColor } : undefined}
          />
        </span>
        Color
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-44">
        <DropdownMenuItem onClick={() => void colors.setMarkColor(thread, null)}>
          <span className="size-3 shrink-0 rounded-full border border-muted-foreground/50" />
          Default
          {thread.markColor === null && <IconCheck className="ml-auto" />}
        </DropdownMenuItem>
        {THREAD_COLORS.map(({ name, value }) => (
          <DropdownMenuItem key={value} onClick={() => void colors.setMarkColor(thread, value)}>
            <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: value }} />
            {name}
            {thread.markColor === value && <IconCheck className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function ThreadOptionsMenu({
  thread,
  trigger,
  canRun,
  canColor,
  align = "start",
  onShare,
  onRename,
}: Props) {
  const handingOff = useRef(false);
  const { exportThread } = useExportThread();

  async function copyThreadUrl() {
    const copied = await copyToClipboard(`${window.location.origin}/threads/${thread.id}`);
    toast.add(
      copied
        ? { title: "Thread URL copied", type: "success" }
        : { title: "Could not copy the thread URL", type: "error" },
    );
  }

  function handleOpenChange(open: boolean) {
    if (open) handingOff.current = false;
  }

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger render={trigger}>
        <IconDots />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-auto min-w-[300px]"
        finalFocus={() => !handingOff.current}
      >
        <DropdownMenuItem onClick={() => void copyThreadUrl()}>
          <IconCopy />
          Copy Thread URL
        </DropdownMenuItem>
        {onShare && (
          <DropdownMenuItem
            onClick={() => {
              handingOff.current = true;
              onShare();
            }}
          >
            <IconShare />
            Manage Sharing
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => void exportThread(thread)}>
          <IconDownload />
          Export
        </DropdownMenuItem>
        {canRun && (
          <>
            <DropdownMenuSeparator className="mx-1.5 my-1.5 bg-border/70" />
            <ThreadRunChoices thread={thread} />
          </>
        )}
        {(canColor || onRename) && (
          <>
            <DropdownMenuSeparator className="mx-1.5 my-1.5 bg-border/70" />
            {canColor && <ThreadColor thread={thread} />}
            {onRename && (
              <DropdownMenuItem
                onClick={() => {
                  handingOff.current = true;
                  onRename();
                }}
              >
                <IconPencil />
                Rename
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
