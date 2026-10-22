import type { FormEvent } from "react";

import { Button } from "@/components/button";
import { Form } from "@/components/form";
import { TextField } from "@/components/text-field";
import { toast } from "@/components/toast";

type Props = {
  name: string;
  email: string;
};

export function ProfileForm({ name, email }: Props) {
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    toast.add({ title: "Profile saved", type: "success" });
  }

  return (
    <Form onSubmit={save} className="flex max-w-md flex-col gap-4">
      <TextField label="Name" name="name" defaultValue={name} />
      <TextField label="Email" name="email" defaultValue={email} disabled />
      <Button type="submit" className="w-fit">
        Save changes
      </Button>
    </Form>
  );
}
