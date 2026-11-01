# Connect GitHub

Projects are GitHub repositories. In **Settings > Platform** (as the owner whose email you gave the
installer) press **Create GitHub App**: GitHub asks you to confirm the app's name and permissions
and to install it on your account or organization, and Aven keeps the credentials itself. Nothing
to copy into `.env`. Then each person presses **Connect GitHub** once, so that what the agent
pushes and the pull requests it opens are theirs.

Things to know:

- GitHub app names are unique across GitHub. Aven suggests `Aven (<your host>)`, which is the same
  for every install on `localhost`, so you will probably have to pick another name on GitHub's
  confirmation page. Give the **Organization** field a name if a GitHub organization should own the
  app rather than you.
- By default the app is private: only the account or organization that owns it can install it. To
  install it on several organizations, turn on **Allow installing on other accounts and
  organizations** before pressing Create. For an app that already exists, make it public in its
  settings on GitHub (**Advanced > Make public**). Public only means anyone may install it; nobody can
  use it without this server's credentials. Either way an organization's owner may have to approve
  the install, because the app asks for write access to code and pull requests.
- If you would rather make the app yourself, set the `GITHUB_APP_*` variables in
  `~/.aven/server/.env` (see [`.env.example`](../../.env.example)); an app set there is used instead.
