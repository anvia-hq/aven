import { useState, type FormEvent } from "react";

import { authClient } from "../../../lib/auth-client";
import { Button } from "../../../components/button";
import { Form } from "../../../components/form";
import { TextField } from "../../../components/text-field";

type Props = {
  mode: "sign-in" | "sign-up";
  onSuccess: () => void;
};

export function AuthForm({ mode, onSuccess }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));

    setError(null);
    setPending(true);
    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({ email, password, name: String(data.get("name")) })
        : await authClient.signIn.email({ email, password });
    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Something went wrong");
      return;
    }
    onSuccess();
  }

  return (
    <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
