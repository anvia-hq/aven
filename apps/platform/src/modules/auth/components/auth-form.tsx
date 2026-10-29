import { Button } from "@/components/button";
import { Form } from "@/components/form";
import { TextField } from "@/components/text-field";

import { useAuthForm } from "../hooks/use-auth-form";

type Props = {
  mode: "sign-in" | "sign-up";
  onSuccess: () => void;
};

export function AuthForm({ mode, onSuccess }: Props) {
  const { error, pending, submit } = useAuthForm(mode, onSuccess);

  return (
    <Form onSubmit={submit} className="flex flex-col gap-4">
      {mode === "sign-up" && <TextField label="Name" name="name" required autoComplete="name" />}
      <TextField label="Email" name="email" type="email" required autoComplete="email" />
      <TextField
        label="Password"
        name="password"
        type="password"
        required
        minLength={8}
        autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {mode === "sign-up" ? "Create account" : "Sign in"}
      </Button>
    </Form>
  );
}
