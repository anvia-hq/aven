import { UserPlus } from "@mynaui/icons-react";
import { useState, type FormEvent } from "react";

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
import { Field, FieldLabel } from "@/components/field";
import { Form } from "@/components/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";
import { TextField } from "@/components/text-field";

import { useMembers } from "../hooks/use-members";
import { isInvitableRole, ROLE_LABELS, ROLES, type InvitableRole } from "../types";

export function InviteMemberDialog() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<InvitableRole>("member");
  const { invite } = useMembers();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sent = await invite(String(new FormData(event.currentTarget).get("email")).trim(), role);

    if (sent) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <UserPlus /> Invite member
      </DialogTrigger>
      <DialogContent>
        <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Invite a member</DialogTitle>
            <DialogDescription>They'll get an email with a link to join.</DialogDescription>
          </DialogHeader>
          <TextField
            label="Email"
            name="email"
            type="email"
            required
            placeholder="name@company.com"
          />
          <Field>
            <FieldLabel>Role</FieldLabel>
            <Select
              value={role}
              onValueChange={(value) => isInvitableRole(value) && setRole(value)}
            >
              <SelectTrigger aria-label="Role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {ROLE_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button type="submit">Send invite</Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
