import { Button } from "@aven/ui/button";
import { Form } from "@aven/ui/form";
import { TextField } from "@aven/ui/text-field";

import { useAuthForm } from "../hooks/use-auth-form";

const field = "h-10 bg-background";

type Props = {
  mode: "sign-in" | "sign-up";
  onSuccess: () => void;
};

export function AuthForm({ mode, onSuccess }: Props) {
  const { error, pending, submit } = useAuthForm(mode, onSuccess);

  return (
    <Form onSubmit={submit} className="flex flex-col gap-4">
      {mode === "sign-up" && (
        <TextField
          label="Name"
          name="name"
          placeholder="Your name"
          required
          autoComplete="name"
          className={field}
        />
      )}
      <TextField
        label="Email"
        name="email"
        placeholder="you@example.com"
        type="email"
        required
        autoComplete="email"
        className={field}
      />
      <TextField
        label="Password"
        name="password"
        placeholder={mode === "sign-up" ? "At least 8 characters" : "Your password"}
        type="password"
        required
        minLength={8}
        className={field}
        autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
      />
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
        {mode === "sign-up" ? "Create account" : "Sign in"}
      </Button>
    </Form>
  );
}
