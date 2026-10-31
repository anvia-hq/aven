import { BOT_AVATAR_MAX, BOT_INSTRUCTION_MAX, BOT_NAME_MAX } from "@aven/protocol/bots";
import { Cog } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/dialog";
import { Form } from "@/components/form";
import { Label } from "@/components/label";
import { Textarea } from "@/components/textarea";
import { TextField } from "@/components/text-field";

import { useBotForm } from "../hooks/use-bot-form";
import type { Bot } from "../types";

// Where the person changes who the bot is: its name, its avatar and what it is told to be like.
export function BotSettingsDialog({ bot }: { bot: Bot }) {
  const [open, setOpen] = useState(false);
  const form = useBotForm(bot, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Bot settings" />}>
        <Cog />
      </DialogTrigger>
      <DialogContent>
        <Form ref={form.formRef} onSubmit={form.submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Bot settings</DialogTitle>
            <DialogDescription>
              Who the bot is. It follows the instruction in every chat; what it sends and how fast
              it types are its own.
            </DialogDescription>
          </DialogHeader>
          <TextField
            label="Name"
            name="name"
            required
            autoComplete="off"
            maxLength={BOT_NAME_MAX}
            defaultValue={bot.name}
          />
          <TextField
            label="Avatar"
            name="avatar"
            autoComplete="off"
            maxLength={BOT_AVATAR_MAX}
            placeholder="An emoji, such as 🐦"
            defaultValue={bot.avatar}
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor="bot-instruction">Instruction</Label>
            <Textarea
              id="bot-instruction"
              name="instruction"
              rows={5}
              maxLength={BOT_INSTRUCTION_MAX}
              placeholder="How it should talk, what it is like, what it should care about"
              defaultValue={bot.instruction}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={form.submitting}>
              Save changes
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
