// A stand-in for GitHub for the e2e run: just the endpoints the control plane calls, with one
// installation (id 1, account "acme") that can see a few repositories.
const port = Number(process.env.FAKE_GITHUB_PORT ?? 8101);
// Where the app is served, which GitHub sends the browser back to after it is authorised.
const appUrl = process.env.FAKE_GITHUB_APP_URL ?? "http://localhost:5174";
const repositories = ["shiny-app", "docs-site", "composer-app", "project"];

// Writing approved for the installation, and the person allowed to push (decisions 0041 and 0044).
const repo = (name: string) => ({
  id: repositories.indexOf(name) + 1,
  full_name: `acme/${name}`,
  private: true,
  default_branch: "main",
  clone_url: `https://github.com/acme/${name}.git`,
  description: null,
  permissions: { push: true },
});

type Pull = {
  number: number;
  html_url: string;
  title: string;
  state: string;
  merged_at: string | null;
  head: { ref: string; repo: { full_name: string } };
};
// Newest last, by repository.
const pullRequests = new Map<string, Pull[]>();

Bun.serve({
  port,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    // Pull requests: none is open until one is created (a spec does it, standing in for the agent's
    // `gh pr create`, decision 0044), with the branch it was opened from (decision 0069). They are
    // listed newest first, with whatever the query asks for ignored.
    if (/^\/repos\/acme\/[\w.-]+\/pulls$/.test(pathname)) {
      const list = pullRequests.get(pathname) ?? [];
      if (request.method === "POST") {
        const { head = "", title = "A pull request" } = (await request
          .json()
          .catch(() => ({}))) as {
          head?: string;
          title?: string;
        };
        // Numbered from 7 for each thread (the branches that share a prefix), since specs that run
        // at the same time share the repository and each expects to see its own first.
        const thread = (branch: string) => branch.split("-")[0];
        const number = 7 + list.filter((pull) => thread(pull.head.ref) === thread(head)).length;
        const made: Pull = {
          number,
          html_url: `https://github.com/acme/pull/${number}`,
          title,
          state: "open",
          merged_at: null,
          head: { ref: head, repo: { full_name: pathname.split("/").slice(2, 4).join("/") } },
        };
        pullRequests.set(pathname, [...list, made]);
        return Response.json(made, { status: 201 });
      }
      return Response.json([...list].reverse());
    }
    if (pathname === "/health") return new Response("ok");
    // The page where a person lets the app act as them: they agree at once and come back.
    if (pathname === "/login/oauth/authorize") {
      const state = new URL(request.url).searchParams.get("state") ?? "";
      const back = new URL("/api/github/callback", appUrl);
      back.searchParams.set("code", "fake");
      back.searchParams.set("state", state);
      return Response.redirect(back.toString(), 302);
    }
    if (pathname === "/login/oauth/access_token") {
      return Response.json({
        access_token: "ghu_fake",
        expires_in: 28800,
        refresh_token: "ghr_fake",
        refresh_token_expires_in: 15811200,
      });
    }
    if (pathname === "/user") return Response.json({ id: 42, login: "ada", name: "Ada" });
    if (pathname === "/user/installations") return Response.json({ installations: [{ id: 1 }] });
    if (pathname === "/installation/repositories") {
      return Response.json({ repositories: repositories.map(repo) });
    }
    if (/^\/app\/installations\/\d+$/.test(pathname)) {
      return Response.json({
        id: Number(pathname.split("/").pop()),
        account: { login: "acme" },
        permissions: { contents: "write", pull_requests: "write", metadata: "read" },
      });
    }
    if (pathname.endsWith("/access_tokens")) {
      const expires = new Date(Date.now() + 60 * 60_000).toISOString();
      return Response.json({ token: "ghs_fake", expires_at: expires });
    }
    const name = pathname.match(/^\/repos\/acme\/([\w.-]+)$/)?.[1];
    if (name && repositories.includes(name)) return Response.json(repo(name));
    return new Response("not found", { status: 404 });
  },
});
