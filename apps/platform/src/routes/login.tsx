import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";

import { authClient } from "../lib/auth-client";
import { AuthForm } from "../modules/auth/components/auth-form";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const { data } = await authClient.getSession();
    if (data) throw redirect({ to: "/dashboard" });
  },
  component: Login,
});

function Login() {
  const navigate = useNavigate();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Sign in to Aven</h1>
      <AuthForm mode="sign-in" onSuccess={() => navigate({ to: "/dashboard" })} />
      <p className="text-sm text-muted-foreground">
        Don't have an account?{" "}
        <Link to="/register" className="font-medium text-foreground underline">
          Register
        </Link>
      </p>
    </main>
  );
}
