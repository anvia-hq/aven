const port = Number(process.env.FAKE_GITHUB_PORT ?? 8101);
const appUrl = process.env.FAKE_GITHUB_APP_URL ?? "http://localhost:5174";
const repositories = ["shiny-app", "docs-site", "composer-app", "project"];

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

type StoredPull = { test: string; pull: Pull };

const SHARED_TEST = "shared";
const pullRequests = new Map<string, StoredPull[]>();

const testOf = (url: URL, headers: Headers): string | null =>
  url.searchParams.get("test") ?? headers.get("x-fake-github-test");

const pullsOf = (repository: string): StoredPull[] => pullRequests.get(repository) ?? [];

const threadOf = (branch: string) => branch.split("-")[0];

function searchTitles(pulls: boolean, open: boolean) {
  if (pulls && open) return Array.from({ length: 12 }, (_, i) => `Open pull request ${12 - i}`);

  if (pulls) return ["Merged pull request", "Closed pull request"];

  return open ? ["Open issue two", "Open issue one"] : ["Closed issue"];
}

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
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/__reset" && request.method === "POST") {
      const test = testOf(url, request.headers);
      const repository = url.searchParams.get("repo");
      for (const key of pullRequests.keys()) {
        if (repository !== null && key !== repository) continue;

        const kept = test === null ? [] : pullsOf(key).filter((entry) => entry.test !== test);

        if (kept.length === 0) pullRequests.delete(key);
        else pullRequests.set(key, kept);
      }
      return Response.json({ reset: true });
    }

    const pulls = pathname.match(/^\/repos\/acme\/([\w.-]+)\/pulls$/);

    if (pulls) {
      const repository = `acme/${pulls[1]}`;
      const test = testOf(url, request.headers);
      const list = pullsOf(repository);

      if (request.method === "POST") {
        const { head = "", title = "A pull request" } = (await request
          .json()
          .catch(() => ({}))) as {
          head?: string;
          title?: string;
        };
        const owner = test ?? SHARED_TEST;
        const number =
          7 +
          list.filter(
            (entry) => entry.test === owner && threadOf(entry.pull.head.ref) === threadOf(head),
          ).length;
        const made: Pull = {
          number,
          html_url: `https://github.com/acme/pull/${number}`,
          title,
          state: "open",
          merged_at: null,
          head: { ref: head, repo: { full_name: repository } },
        };
        pullRequests.set(repository, [...list, { test: owner, pull: made }]);
        return Response.json(made, { status: 201 });
      }

      const visible = test === null ? list : list.filter((entry) => entry.test === test);
      return Response.json(visible.map((entry) => entry.pull).reverse());
    }

    if (pathname === "/health") return new Response("ok");

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
      const asked = new URL(request.url).searchParams;
      const commits = Array.from({ length: 14 }, (_, index) => ({
        sha: sha(14 - index),
        commit: {
          message: `Change number ${14 - index}\n\nWhy it changed, which is not shown.`,
          author: {
            name: "Ada Lovelace",
            date: new Date(Date.now() - index * 3_600_000).toISOString(),
          },
        },
        author: { login: "ada", avatar_url: "https://avatars.githubusercontent.com/u/1?v=4" },
        parents: parentsOf(14 - index).map((n) => ({ sha: sha(n) })),
      }));
      const wanted = commits.filter((entry, index) => {
        const number = 14 - index;

        if (asked.get("author") && !/ada/i.test(asked.get("author")!)) return false;

        if (asked.get("sha") === "feature/login" && number > 10) return false;

        if (asked.get("path") && !(asked.get("path") === "src/login.ts" && number % 2 === 0))
          return false;

        const since = asked.get("since");

        if (since && Date.parse(entry.commit.author.date) < Date.parse(since)) return false;

        return true;
      });
      return Response.json(wanted.slice((page - 1) * 10, page * 10), {
        headers:
          page === 1
            ? { link: '<https://api.github.com/repositories/1/commits?page=2>; rel="next"' }
            : {},
      });
    }

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
      const words = query
        .replace(/\S+:\S+/g, "")
        .replace(/"[^"]*"/g, "")
        .trim()
        .toLowerCase();
      let items = titles.flatMap((title, index) => {
        if (qualifier("author") && qualifier("author") !== "ada") return [];

        if (qualifier("review-requested") && (qualifier("review-requested") !== "ada" || index > 2))
          return [];

        if (qualifier("draft") === "true" && !(pulls && open && index === 0)) return [];

        if (qualifier("draft") === "false" && pulls && open && index === 0) return [];

        if (qualifier("label") && !(qualifier("label") === "bug" && index % 2 === 0)) return [];

        if (qualifier("status") === "failure" && index % 2 === 0) return [];

        if (qualifier("status") === "success" && index % 2 === 1) return [];

        if (qualifier("review") === "approved" && index > 1) return [];

        if (words && !title.toLowerCase().includes(words.replace(" in", "").trim())) return [];

        return [
          {
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
          },
        ];
      });

      if (new URL(request.url).searchParams.get("order") === "asc") items = items.reverse();

      return Response.json({
        total_count: items.length,
        items: items.slice((page - 1) * 10, page * 10),
      });
    }

    const tags = pathname.match(/^\/repos\/acme\/([\w.-]+)\/tags$/)?.[1];

    if (tags && repositories.includes(tags)) {
      return Response.json([{ name: "v1.0", commit: { sha: sha(12) } }]);
    }

    const branches = pathname.match(/^\/repos\/acme\/([\w.-]+)\/branches$/)?.[1];

    if (branches && repositories.includes(branches)) {
      return Response.json([
        { name: "main", protected: true, commit: { sha: sha(14) } },
        { name: "feature/login", protected: false, commit: { sha: sha(10) } },
        { name: "old/spike", protected: false, commit: { sha: sha(2) } },
      ]);
    }

    const tip = pathname.match(
      /^\/repos\/acme\/([\w.-]+)\/commits\/(main|feature%2Flogin|old%2Fspike)$/,
    );

    if (tip && repositories.includes(tip[1]!)) {
      const number = { main: 14, "feature%2Flogin": 10, "old%2Fspike": 2 }[tip[2]!]!;
      return Response.json({
        sha: sha(number),
        commit: {
          message: `Change number ${number}`,
          author: {
            name: "Ada Lovelace",
            date: new Date(
              Date.now() - (tip[2] === "old%2Fspike" ? 90 * 86_400_000 : 3_600_000),
            ).toISOString(),
          },
        },
        author: { login: "ada" },
        parents: [],
      });
    }

    const compare = pathname.match(
      /^\/repos\/acme\/([\w.-]+)\/compare\/main\.\.\.(feature%2Flogin|old%2Fspike)$/,
    );

    if (compare && repositories.includes(compare[1]!)) {
      return Response.json(
        compare[2] === "old%2Fspike"
          ? { ahead_by: 1, behind_by: 40 }
          : { ahead_by: 3, behind_by: 2 },
      );
    }

    const name = pathname.match(/^\/repos\/acme\/([\w.-]+)$/)?.[1];

    if (name && repositories.includes(name)) return Response.json(repo(name));

    return new Response("not found", { status: 404 });
  },
});
