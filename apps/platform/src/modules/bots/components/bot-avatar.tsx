import { useId, type CSSProperties, type ReactNode } from "react";

import { Avatar, AvatarFallback } from "@/components/avatar";

import { avatarFor, parseAvatarSetting } from "../avatar";
import type { Avatar as Look, Bot, BotMood, Part, Point } from "../types";

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

const LOOK: Record<Look["face"], Point> = {
  smile: { x: 0, y: 0 },
  grin: { x: 0, y: 0 },
  curious: { x: 1.3, y: -1.3 },
  glance: { x: -1.8, y: 0.4 },
};

function Face({ look, mood }: { look: Look; mood: BotMood }) {
  const { center, face } = look;
  const gaze = LOOK[face];
  return (
    <g
      className="fill-none stroke-avatar-face"
      strokeWidth={LINE}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g>
        {[-EYE_SPACING, EYE_SPACING].map((offset) =>
          mood === "working" ? (
            <g key={offset} className="stroke-none">
              <circle
                className="fill-avatar-eye"
                cx={center.x + offset}
                cy={center.y - 1}
                r={5.1}
              />
              <circle
                className="bot-pupil fill-avatar-face"
                cx={center.x + offset + gaze.x}
                cy={center.y - 1 + gaze.y}
                r={2.7}
              />
            </g>
          ) : (
            <path key={offset} d={`M${center.x + offset - 2.6} ${center.y - 1.5}q2.6 3 5.2 0`} />
          ),
        )}
      </g>
      {face === "smile" && <path d={`M${center.x - 6.5} ${center.y + 2.5}q6.5 6 13 0`} />}
      {face === "grin" && <path d={`M${center.x - 3} ${center.y + 4}q3 3 6 0`} />}
    </g>
  );
}

export function BotAvatar({
  bot,
  mood = "idle",
  className,
  children,
}: {
  bot: Pick<Bot, "id" | "avatar">;
  mood?: BotMood;
  className?: string;
  children?: ReactNode;
}) {
  const setting = parseAvatarSetting(bot.avatar);
  const text = setting === null && bot.avatar !== "" && !bot.avatar.startsWith("{");
  const look = avatarFor(bot.id, setting ?? undefined);
  const maskId = `bot-mask-${useId().replace(/:/g, "")}`;
  return (
    <Avatar className={className}>
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
          data-mood={mood}
          className="bot-avatar size-full!"
          style={{ "--bot-delay": `-${look.delay}ms` } as CSSProperties}
        >
          <g className="bot-hop">
            <g className="bot-body">
              <Body parts={look.parts} color={look.color} />
              {mood === "working" ? (
                <>
                  <mask
                    id={maskId}
                    maskUnits="userSpaceOnUse"
                    x={-20}
                    y={-20}
                    width={88}
                    height={88}
                  >
                    <Body parts={look.parts} color="#fff" />
                  </mask>
                  <g mask={`url(#${maskId})`}>
                    <g className="bot-face">
                      <Face look={look} mood={mood} />
                    </g>
                  </g>
                </>
              ) : (
                <Face look={look} mood={mood} />
              )}
            </g>
          </g>
        </svg>
      )}
      {children}
    </Avatar>
  );
}
