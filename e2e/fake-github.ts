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

// What the fake's search finds: pull requests or issues, open or closed, the latest changed first.
function searchTitles(pulls: boolean, open: boolean) {
  if (pulls && open) return Array.from({ length: 12 }, (_, i) => `Open pull request ${12 - i}`);
  if (pulls) return ["Merged pull request", "Closed pull request"];
  return open ? ["Open issue two", "Open issue one"] : ["Closed issue"];
}

// What a pull request and a commit change, as GitHub lists the files.
const changedFiles = [
  {
    filename: "src/login.ts",
    status: "modified",
    additions: 2,
    deletions: 1,
    patch: "@@ -1,3 +1,4 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;",
  },
  { filename: "logo.png", status: "added", additions: 0, deletions: 0 },
];

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
        // Issues are listed only when the app may read them (decision 0092).
        permissions: {
          contents: "write",
          pull_requests: "write",
          issues: "read",
          metadata: "read",
        },
      });
    }
    if (pathname.endsWith("/access_tokens")) {
      const expires = new Date(Date.now() + 60 * 60_000).toISOString();
      return Response.json({ token: "ghs_fake", expires_at: expires });
    }
    // What the project page reads (decision 0082): the top of every repository, one folder below it
    // and a README, except for composer-app, which has none.
    const contents = pathname.match(/^\/repos\/acme\/([\w.-]+)\/contents(?:\/(.*))?$/);
    if (contents && repositories.includes(contents[1]!)) {
      const folder = contents[2] ?? "";
      if (folder === "") {
        return Response.json([
          { name: "package.json", path: "package.json", type: "file" },
          { name: "src", path: "src", type: "dir" },
          { name: "README.md", path: "README.md", type: "file" },
          { name: "docs", path: "docs", type: "dir" },
        ]);
      }
      if (folder === "src") {
        return Response.json([{ name: "index.ts", path: "src/index.ts", type: "file" }]);
      }
      if (folder === "package.json") {
        return Response.json({ name: "package.json", path: "package.json", type: "file" });
      }
    }
    const readme = pathname.match(/^\/repos\/acme\/([\w.-]+)\/readme$/)?.[1];
    if (readme && repositories.includes(readme) && readme !== "composer-app") {
      const text = `# ${readme}\n\nA **fine** project. Read [the guide](docs/guide.md).\n\n![logo](docs/logo.png)`;
      return Response.json({
        name: "README.md",
        path: "README.md",
        encoding: "base64",
        content: Buffer.from(text).toString("base64"),
      });
    }
    // The history on the project page: fourteen commits, newest first, ten to a page, with GitHub's
    // `next` link on the first page only. Commit 12 merges a branch that began at 9, as 10 and 11 both
    // did: 11 on main and 10 on the branch `feature/login`, whose head it is.
    const sha = (n: number) =>
      `${String(n).padStart(2, "0")}abcdef0123456789abcdef0123456789abcdef`;
    const history = pathname.match(/^\/repos\/acme\/([\w.-]+)\/commits$/)?.[1];
    if (history && repositories.includes(history)) {
      const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
      const parentsOf = (n: number) => {
        if (n === 12) return [11, 10];
        if (n === 11 || n === 10) return [9];
        return n === 1 ? [] : [n - 1];
      };
      const commits = Array.from({ length: 14 }, (_, index) => ({
        sha: sha(14 - index),
        commit: {
          message: `Change number ${14 - index}\n\nWhy it changed, which is not shown.`,
          author: {
            name: "Ada Lovelace",
            date: new Date(Date.now() - index * 3_600_000).toISOString(),
          },
        },
        author: { login: "ada" },
        parents: parentsOf(14 - index).map((n) => ({ sha: sha(n) })),
      }));
      return Response.json(commits.slice((page - 1) * 10, page * 10), {
        headers:
          page === 1
            ? { link: '<https://api.github.com/repositories/1/commits?page=2>; rel="next"' }
            : {},
      });
    }
    // A pull request and a commit opened in Center (decision 0132): number 100 is a draft with a
    // failing check and a review requested, any other is open and approved.
    const opened = pathname.match(/^\/repos\/acme\/([\w.-]+)\/pulls\/(\d+)(\/files|\/reviews)?$/);
    if (opened && repositories.includes(opened[1]!)) {
      const number = Number(opened[2]);
      if (opened[3] === "/files") return Response.json(changedFiles);
      if (opened[3] === "/reviews") {
        return Response.json(
          number === 100
            ? []
            : [
                {
                  user: { login: "grace" },
                  state: "APPROVED",
                  submitted_at: "2026-11-01T10:00:00Z",
                },
              ],
        );
      }
      return Response.json({
        number,
        title: `Open pull request ${12 - (100 - number)}`,
        body: "## Why\n\nIt makes the login **faster**.",
        html_url: `https://github.com/acme/${opened[1]}/pull/${number}`,
        state: "open",
        draft: number === 100,
        merged: false,
        user: { login: "ada" },
        base: { ref: "main" },
        head: { ref: "feature/login", sha: sha(10) },
        additions: 3,
        deletions: 1,
        changed_files: changedFiles.length,
        commits: 2,
        comments: 1,
        review_comments: 2,
        created_at: new Date(Date.now() - 86_400_000).toISOString(),
        updated_at: new Date().toISOString(),
        mergeable: true,
        requested_reviewers: number === 100 ? [{ login: "ada" }] : [],
      });
    }
    const checkRuns = pathname.match(/^\/repos\/acme\/([\w.-]+)\/commits\/[0-9a-f]+\/check-runs$/);
    if (checkRuns && repositories.includes(checkRuns[1]!)) {
      return Response.json({
        check_runs: [
          { name: "build", status: "completed", conclusion: "success", html_url: null },
          { name: "tests", status: "completed", conclusion: "failure", html_url: null },
        ],
      });
    }
    const one = pathname.match(/^\/repos\/acme\/([\w.-]+)\/commits\/([0-9a-f]{7,40})$/);
    if (one && repositories.includes(one[1]!)) {
      return Response.json({
        sha: one[2],
        html_url: `https://github.com/acme/${one[1]}/commit/${one[2]}`,
        commit: {
          message: "Change number 14\n\nWhy it changed, in full.",
          author: { name: "Ada Lovelace", date: new Date().toISOString() },
        },
        author: { login: "ada" },
        parents: [{ sha: sha(13) }],
        stats: { additions: 3, deletions: 1 },
        files: changedFiles,
      });
    }
    // Pull requests and issues on the project page (decision 0092), by GitHub's search: twelve open
    // pull requests (the newest a draft, ten to a page), two closed ones (one merged), two open
    // issues and one closed.
    if (pathname === "/search/issues") {
      const params = new URL(request.url).searchParams;
      const query = params.get("q") ?? "";
      const page = Number(params.get("page") ?? "1");
      const pulls = query.includes("is:pr");
      const open = query.includes("is:open");
      const merged = query.includes("is:merged");
      const titles = merged ? ["Merged pull request"] : searchTitles(pulls, open);
      const qualifier = (name: string) =>
        new RegExp(`${name}:("[^"]+"|\\S+)`).exec(query)?.[1]?.replaceAll('"', "");
      // The qualifiers of the filters (decision 0132): every other pull request carries the label
      // `bug`, the first three await a review from ada, the odd ones fail their checks, and every
      // author is ada.
      const words = query
        .replace(/\S+:\S+/g, "")
        .replace(/"[^"]*"/g, "")
        .trim()
        .toLowerCase();
      let items = titles
        .map((title, index) => ({ title, index }))
        .filter(({ title, index }) => {
          if (qualifier("author") && qualifier("author") !== "ada") return false;
          if (
            qualifier("review-requested") &&
            (qualifier("review-requested") !== "ada" || index > 2)
          )
            return false;
          if (qualifier("draft") === "true" && !(pulls && open && index === 0)) return false;
          if (qualifier("draft") === "false" && pulls && open && index === 0) return false;
          if (qualifier("label") && !(qualifier("label") === "bug" && index % 2 === 0))
            return false;
          if (qualifier("status") === "failure" && index % 2 === 0) return false;
          if (qualifier("status") === "success" && index % 2 === 1) return false;
          if (qualifier("review") === "approved" && index > 1) return false;
          return !words || title.toLowerCase().includes(words.replace(" in", "").trim());
        })
        .map(({ title, index }) => ({
          number: 100 - index,
          title,
          html_url: `https://github.com/acme/web/${pulls ? "pull" : "issues"}/${100 - index}`,
          state: open ? "open" : "closed",
          draft: pulls && open && index === 0,
          comments: index === 0 ? 3 : 0,
          labels: index % 2 === 0 ? [{ name: "bug" }] : [],
          updated_at: new Date(Date.now() - index * 3_600_000).toISOString(),
          user: { login: "ada" },
          pull_request: pulls
            ? { merged_at: merged || (!open && index === 0) ? "2026-10-30T10:00:00Z" : null }
            : undefined,
        }));
      if (new URL(request.url).searchParams.get("order") === "asc") items = items.reverse();
      return Response.json({
        total_count: items.length,
        items: items.slice((page - 1) * 10, page * 10),
      });
    }
    const branches = pathname.match(/^\/repos\/acme\/([\w.-]+)\/branches$/)?.[1];
    if (branches && repositories.includes(branches)) {
      return Response.json([
        { name: "main", commit: { sha: sha(14) } },
        { name: "feature/login", commit: { sha: sha(10) } },
      ]);
    }
    const name = pathname.match(/^\/repos\/acme\/([\w.-]+)$/)?.[1];
    if (name && repositories.includes(name)) return Response.json(repo(name));
    return new Response("not found", { status: 404 });
  },
});
