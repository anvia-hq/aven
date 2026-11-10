import type { FormEvent } from "react";

import { Button } from "@/components/button";
import { Form } from "@/components/form";
import { TextField } from "@/components/text-field";

import { useUpdateProfile } from "../hooks/use-update-profile";
import { AvatarField } from "./avatar-field";

type Props = {
  name: string;
  email: string;
  image: string | null;
};

export function ProfileForm({ name, email, image }: Props) {
  const updateProfile = useUpdateProfile();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (next) await updateProfile(next);
  }

  return (
    <Form onSubmit={save} className="flex flex-col gap-4">
      <AvatarField name={name} image={image} />
      <TextField label="Name" name="name" defaultValue={name} required />
      <TextField label="Email" name="email" defaultValue={email} disabled />
      <Button type="submit" className="w-fit">
        Save changes
      </Button>
    </Form>
  );
}
