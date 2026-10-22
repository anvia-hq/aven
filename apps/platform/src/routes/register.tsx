import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";

import { authClient } from "../lib/auth-client";
import { AuthForm } from "../modules/auth/components/auth-form";

export const Route = createFileRoute("/register")({
  beforeLoad: async () => {
    const { data } = await authClient.getSession();
    if (data) throw redirect({ to: "/dashboard" });
  },
  component: Register,
});

function Register() {
  const navigate = useNavigate();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Create your account</h1>
      <AuthForm mode="sign-up" onSuccess={() => navigate({ to: "/dashboard" })} />
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-foreground underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
