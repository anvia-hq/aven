import { BotAvatar } from "./bot-avatar";

/** A bot mentioned in a message, as its token is shown in the composer and in what was sent. */
export function BotMentionChip({ bot }: { bot: { id: string; name: string; avatar: string } }) {
  return (
    <span
      className="inline-flex h-fit items-center gap-1 rounded-full bg-muted py-0.5 pr-2 pl-0.5 align-middle leading-none font-medium text-[0.9em]"
      title={`@${bot.name}`}
      data-mention="bot"
    >
      <BotAvatar bot={bot} className="size-4" />
      {bot.name}
    </span>
  );
}
