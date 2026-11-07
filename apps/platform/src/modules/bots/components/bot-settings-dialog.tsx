import { BOT_DESCRIPTION_MAX, BOT_INSTRUCTION_MAX, BOT_NAME_MAX } from "@aven/protocol/bots";
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
import { BotAvatarPicker } from "./bot-avatar-picker";

export function BotSettingsDialog({ bot }: { bot: Bot }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Bot settings" />}>
        <Cog />
      </DialogTrigger>
      <DialogContent>
        <BotSettingsForm bot={bot} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function BotSettingsForm({ bot, onDone }: { bot: Bot; onDone: () => void }) {
  const form = useBotForm(bot, onDone);

  return (
    <Form ref={form.formRef} onSubmit={form.submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Bot settings</DialogTitle>
        <DialogDescription>
          Who the bot is. It follows the instruction in every chat; what it sends and how fast it
          types are its own.
        </DialogDescription>
      </DialogHeader>
      <BotAvatarPicker botId={bot.id} value={form.avatar} onChange={form.setAvatar} />
      <TextField
        label="Name"
        name="name"
        required
        autoComplete="off"
        maxLength={BOT_NAME_MAX}
        defaultValue={bot.name}
      />
      <TextField
        label="Description"
        name="description"
        autoComplete="off"
        maxLength={BOT_DESCRIPTION_MAX}
        placeholder="What it is for, in a line"
        defaultValue={bot.description}
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
  );
}
