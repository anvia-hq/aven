import type { ReactNode } from "react";
import type { CSSProperties } from "react";

import { Avatar, AvatarFallback } from "@/components/avatar";

import { avatarFor, parseAvatarSetting, type Avatar as Look, type Part } from "../avatar";
import type { Bot } from "../types";

// A round corner is a stroke of the shape's own color, so a polygon only needs its points.
const CORNER = 6;
const LINE = 2.6;
const EYE_SPACING = 5.7;

function Body({ parts, color }: { parts: readonly Part[]; color: string }) {
  return parts.map((part, index) => {
    switch (part.kind) {
      case "circle":
        return <circle key={index} cx={part.cx} cy={part.cy} r={part.r} fill={color} />;
      case "rect":
        return (
          <rect
            key={index}
            x={part.x}
            y={part.y}
            width={part.width}
            height={part.height}
            rx={part.r}
            fill={color}
          />
        );
      case "path":
        return <path key={index} d={part.d} fill={color} />;
      case "polygon":
        return (
          <polygon
            key={index}
            points={part.points}
            fill={color}
            stroke={color}
            strokeWidth={CORNER}
            strokeLinejoin="round"
          />
        );
    }
  });
}

// Eyes shut as in a smile, and the mouth the face has: a smile, a grin or none.
function Face({ look }: { look: Look }) {
  const { center, face } = look;
  return (
    <g
      className="fill-none stroke-avatar-face"
      strokeWidth={LINE}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {[-EYE_SPACING, EYE_SPACING].map((offset) => {
        const x = center.x + offset - 2.6;
        return <path key={offset} d={`M${x} ${center.y - 1.5}q2.6 3 5.2 0`} />;
      })}
      {face === "smile" && <path d={`M${center.x - 6.5} ${center.y + 2.5}q6.5 6 13 0`} />}
      {face === "grin" && <path d={`M${center.x - 3} ${center.y + 4}q3 3 6 0`} />}
    </g>
  );
}

// The bot's character: the one the person chose, or the one its id draws (decision 0062). An
// avatar that is plain text, from before characters, is shown as the text. `children` can add to
// the avatar, such as a badge. The box is cropped to the shapes, which fill about 80% of their 48
// by 48 one, and the size is forced with `!` because a sidebar button sizes every svg in it to 16px.
export function BotAvatar({
  bot,
  size,
  className,
  children,
}: {
  bot: Pick<Bot, "id" | "avatar">;
  size?: "default" | "sm" | "lg";
  className?: string;
  children?: ReactNode;
}) {
  const setting = parseAvatarSetting(bot.avatar);
  const text = setting === null && bot.avatar !== "";
  const look = avatarFor(bot.id, setting ?? undefined);
  return (
    <Avatar size={size} className={className}>
      {text ? (
        <AvatarFallback className="bg-primary text-[length:inherit] text-primary-foreground">
          {bot.avatar}
        </AvatarFallback>
      ) : (
        <svg
          viewBox="4 4 40 40"
          aria-hidden="true"
          focusable="false"
          data-family={look.family}
          data-color={look.color}
          className="bot-avatar size-full!"
          style={{ "--bot-delay": `-${look.delay}ms` } as CSSProperties}
        >
          <g className="bot-body">
            <Body parts={look.parts} color={look.color} />
            <Face look={look} />
          </g>
        </svg>
      )}
      {children}
    </Avatar>
  );
}
