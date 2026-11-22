import { useState } from "react";

import { Button } from "@aven/ui/button";
import { Toggle } from "@aven/ui/toggle";

import { accessories, colors, families, formatAvatarSetting } from "../avatar";
import type { AvatarAccessory, BotMood } from "../types";
import { BotAvatar } from "./bot-avatar";

const SHOWCASE_DETAILS: Record<
  string,
  { idle: string; working: string; accessory: AvatarAccessory }
> = {
  circle: { idle: "Zero-G float", working: "Rubber-ball bounce", accessory: "headphones" },
  flower: { idle: "Bloom sway", working: "Petal twirl & pulse", accessory: "sprout" },
  bean: { idle: "Hammock rock", working: "Cheeky wiggle-hop", accessory: "beanie" },
  stack: { idle: "Accordion breathe", working: "Spring-coil bounce", accessory: "glasses" },
  crown: { idle: "Regal hover & scan", working: "Royal double-nod", accessory: "bowtie" },
  arch: { idle: "Pendulum lean", working: "Stomp-march waddle", accessory: "cap" },
  hexagon: { idle: "Gyroscopic drift", working: "Precision tick-turn", accessory: "shades" },
  triangle: { idle: "Curious head-cock", working: "Rocket-boost quiver", accessory: "halo" },
  square: { idle: "Steady calm hum", working: "Snappy tumble-pop", accessory: "glasses" },
  quarter: { idle: "Roly-poly rock", working: "Asymmetric flip-hop", accessory: "cap" },
  capsule: { idle: "Buoyant wave roll", working: "Surf-shimmy bob", accessory: "shades" },
  diamond: { idle: "Crystal levitation", working: "360° pirouette spin", accessory: "tophat" },
};

const ACCESSORY_LABELS: Record<AvatarAccessory, string> = {
  none: "None",
  beanie: "Beanie",
  cap: "Cap",
  tophat: "Top hat",
  glasses: "Glasses",
  shades: "Shades",
  headphones: "Headphones",
  sprout: "Sprout",
  halo: "Halo",
  bowtie: "Bow tie",
};

export function BotAvatarsShowcase() {
  const [mood, setMood] = useState<BotMood>("working");
  const [accessoryMode, setAccessoryMode] = useState<"signature" | AvatarAccessory>("signature");
  const [colorMode, setColorMode] = useState<"palette" | string>("palette");
  const [follow, setFollow] = useState(true);
  const [pausedCards, setPausedCards] = useState<Record<string, BotMood>>({});

  return (
    <div className="h-svh overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Bot Avatars Showcase</h1>
            <p className="text-sm text-muted-foreground">
              All 12 Three.js shapes with expressive mouths, 9 procedural accessories, and unique
              per-shape animations. Click any card to toggle its mood.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={mood === "idle" ? "default" : "outline"}
              onClick={() => {
                setMood("idle");
                setPausedCards({});
              }}
            >
              All Idle
            </Button>
            <Button
              size="sm"
              variant={mood === "working" ? "default" : "outline"}
              onClick={() => {
                setMood("working");
                setPausedCards({});
              }}
            >
              All Working
            </Button>
            <Toggle size="sm" pressed={follow} onPressedChange={setFollow}>
              Follow cursor
            </Toggle>
          </div>
        </header>

        <div className="flex flex-col gap-3 rounded-xl border bg-card/60 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-muted-foreground">Accessory:</span>
            <Toggle
              size="sm"
              className="h-7 rounded-full px-2.5 text-xs"
              pressed={accessoryMode === "signature"}
              onPressedChange={() => setAccessoryMode("signature")}
            >
              Signature mix
            </Toggle>
            {accessories.map((accessory) => (
              <Toggle
                key={accessory}
                size="sm"
                className="h-7 rounded-full px-2.5 text-xs"
                pressed={accessoryMode === accessory}
                onPressedChange={() => setAccessoryMode(accessory)}
              >
                {ACCESSORY_LABELS[accessory]}
              </Toggle>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-medium text-muted-foreground">Color:</span>
            <Toggle
              size="sm"
              className="h-7 rounded-full px-2.5 text-xs"
              pressed={colorMode === "palette"}
              onPressedChange={() => setColorMode("palette")}
            >
              Rainbow
            </Toggle>
            {colors.map((hex) => (
              <Toggle
                key={hex}
                aria-label={`Color ${hex}`}
                className="size-6 rounded-full p-0.5"
                pressed={colorMode === hex}
                onPressedChange={() => setColorMode(hex)}
              >
                <span className="size-full rounded-full" style={{ background: hex }} />
              </Toggle>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {families.map((family, index) => {
            const detail = SHOWCASE_DETAILS[family]!;
            const cardMood = pausedCards[family] ?? mood;
            const accessory = accessoryMode === "signature" ? detail.accessory : accessoryMode;
            const color = colorMode === "palette" ? colors[index % colors.length]! : colorMode;
            const avatar = formatAvatarSetting({ family, color, accessory });

            return (
              <Button
                key={family}
                type="button"
                variant="ghost"
                onClick={() =>
                  setPausedCards((prev) => ({
                    ...prev,
                    [family]: cardMood === "working" ? "idle" : "working",
                  }))
                }
                className="flex h-auto flex-col items-center gap-3 rounded-2xl border bg-card p-5 text-center transition-colors hover:bg-accent/50"
              >
                <BotAvatar
                  bot={{ id: `showcase-${family}`, avatar }}
                  mood={cardMood}
                  follow={follow}
                  delayMs={index * 180}
                  className="size-32"
                />
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold capitalize">{family}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {cardMood}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {cardMood === "working" ? detail.working : detail.idle}
                  </span>
                  <span className="text-[11px] text-muted-foreground/80">
                    Accessory: {ACCESSORY_LABELS[accessory]}
                  </span>
                </div>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
