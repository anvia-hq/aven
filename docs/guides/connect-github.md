# Connect GitHub

Projects are GitHub repositories. In **Settings > Platform** (as the platform owner: the first account
made on this server, or an email you gave the installer) press **Create GitHub App**: GitHub asks you to confirm the app's name and permissions
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

## A workspace's own app

One server can have workspaces whose repositories belong to different GitHub accounts. An owner or
an admin of a workspace can give it a GitHub App of its own, in **Settings > GitHub** (**Create
GitHub App**, the same steps as above), so the app is owned by that workspace's GitHub organization, has
its own key and is approved on its own. A workspace without one keeps using the platform's app, and
nothing changes for it.

- Each workspace makes its own app once. Repositories already imported keep working through the app
  they were imported with, and importing after the change uses the new app.
- A GitHub account is connected for one app, so a person in two workspaces with different apps
  presses **Connect GitHub** for each, and Ship asks for the one of the thread's project.
- Rolling back to a release before this one runs old code against the new tables, which it ignores;
  a person's connection made in a workspace's own app is not seen by it.

## An app made before it had Workflows and Actions write

An app asks for Workflows and Actions read and write (decision 0216) when it is created. One made earlier
does not have them: the agent's push of a file under `.github/workflows/` is refused with `without
'workflows' permission`, and it cannot start or re-run a workflow. On GitHub, open the app's settings
(**Developer settings > GitHub Apps**, or the organization's), then **Permissions & events**, and set
**Workflows** and **Actions** to **Read and write**. An owner of each installation then approves the
request (GitHub emails them, or it is on the installation's page); until they do, nothing changes.
