import { createFileRoute } from "@tanstack/react-router";

import { Button } from "../modules/ui/components/button";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="p-8">
      <h1 className="mb-4 text-2xl font-bold">Aven</h1>
      <Button>Hello Base UI</Button>
    </main>
  );
}
