// A stand-in for GitHub for the e2e run: just the endpoints the control plane calls, with one
// installation (id 1, account "acme") that can see a few repositories.
const port = Number(process.env.FAKE_GITHUB_PORT ?? 8101);
const repositories = ["shiny-app", "docs-site", "composer-app", "project"];

const repo = (name: string) => ({
  id: repositories.indexOf(name) + 1,
  full_name: `acme/${name}`,
  private: true,
  default_branch: "main",
  clone_url: `https://github.com/acme/${name}.git`,
  description: null,
});

Bun.serve({
  port,
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/health") return new Response("ok");
    if (pathname === "/login/oauth/access_token")
      return Response.json({ access_token: "ghu_fake" });
    if (pathname === "/user/installations") return Response.json({ installations: [{ id: 1 }] });
    if (pathname === "/installation/repositories") {
      return Response.json({ repositories: repositories.map(repo) });
    }
    if (/^\/app\/installations\/\d+$/.test(pathname)) {
      return Response.json({ id: Number(pathname.split("/").pop()), account: { login: "acme" } });
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
