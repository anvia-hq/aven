import { useState } from "react";

import { Button } from "@/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/tabs";
import { Toggle } from "@/components/toggle";

import {
  avatarFor,
  colors,
  families,
  formatAvatarSetting,
  parseAvatarSetting,
  randomSeed,
} from "../avatar";
import { BotAvatar } from "./bot-avatar";
import type { AvatarSetting } from "../types";

const VARIANTS = 15;
const CHOICE = "size-11 rounded-full p-0.5 [&_.bot-body]:animate-none";

const newSeeds = () => Array.from({ length: VARIANTS }, randomSeed);

type PickerProps = {
  botId: string;
  value: string;
  onChange(avatar: string): void;
};

export function BotAvatarPicker({ botId, value, onChange }: PickerProps) {
  const [seeds, setSeeds] = useState(newSeeds);
  const setting = parseAvatarSetting(value) ?? {};
  const current = avatarFor(botId, setting);
  const choose = (change: AvatarSetting) =>
    onChange(formatAvatarSetting({ ...setting, ...change }));
  const show = (look: AvatarSetting) => ({ id: botId, avatar: formatAvatarSetting(look) });

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Change avatar"
        className="mx-auto w-fit rounded-full outline-offset-4 transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-ring data-popup-open:scale-105"
      >
        <BotAvatar bot={{ id: botId, avatar: value }} className="size-18" />
      </PopoverTrigger>
      <PopoverContent align="center" className="w-88 gap-3 p-3">
        <Tabs defaultValue="bot" className="flex-col">
          <div className="flex items-center gap-2">
            <TabsList>
              <TabsTrigger value="bot">Bot</TabsTrigger>
              <TabsTrigger value="generate">Generate</TabsTrigger>
            </TabsList>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => onChange("")}
            >
              Reset
            </Button>
          </div>
          <TabsContent value="bot" className="flex flex-col gap-4 pt-2">
            <div role="group" aria-label="Shape" className="grid grid-cols-6 gap-1.5">
              {families.map((family) => (
                <Toggle
                  key={family.name}
                  aria-label={family.name}
                  className={CHOICE}
                  pressed={current.family === family.name}
                  onPressedChange={() => choose({ family: family.name })}
                >
                  <BotAvatar
                    bot={show({ ...setting, family: family.name, color: current.color })}
                    className="size-full"
                  />
                </Toggle>
              ))}
            </div>
            <div role="group" aria-label="Color" className="flex flex-wrap justify-center gap-2.5">
              {colors.map((color) => (
                <Toggle
                  key={color}
                  aria-label={`Color ${color}`}
                  className="size-8 rounded-full p-1"
                  pressed={current.color.toLowerCase() === color}
                  onPressedChange={() => choose({ color })}
                >
                  <span className="size-full rounded-full" style={{ background: color }} />
                </Toggle>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="generate" className="flex flex-col gap-3 pt-2">
            <div role="group" aria-label="Characters" className="grid grid-cols-5 gap-1.5">
              {seeds.map((seed, index) => (
                <Toggle
                  key={seed}
                  aria-label={`Character ${index + 1}`}
                  className={CHOICE}
                  pressed={setting.seed === seed}
                  onPressedChange={() => onChange(formatAvatarSetting({ seed }))}
                >
                  <BotAvatar bot={show({ seed })} className="size-full" />
                </Toggle>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-center"
              onClick={() => setSeeds(newSeeds())}
            >
              Shuffle
            </Button>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
