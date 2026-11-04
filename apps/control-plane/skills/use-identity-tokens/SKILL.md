---
name: use-identity-tokens
description: Reach a cloud, a vault or a private network as this Aven thread with a short-lived identity token (aven id-token) instead of a stored key. Use when a task needs to deploy, read a secret or call a service that could trust Aven, before asking the person for an API key, or when a service rejects the token.
---

# Using identity tokens instead of keys

`aven id-token` prints a short-lived signed token (an OIDC JWT) that says which Aven thread, project, organization and person this run belongs to. A service that trusts Aven as an issuer can swap it for access, so nothing long-lived has to sit in the sandbox. Prefer it to asking for a key when the service supports it (AWS, Google Cloud, Azure, Vault, Tailscale, or the person's own backend).

## Where it works

- **Only in a thread's run, in its sandbox.** A bot's computer and the setup container have no identity: the command says `this run has no identity to mint tokens with`. A bot cannot mint one; say so and suggest doing it in a thread.
- It is a command, not a tool. Run it with `exec_command`.

## Minting one

```sh
TOKEN=$(aven id-token --audience <the service's audience>)
```

- `--audience` is required: the value the service expects, such as `sts.amazonaws.com` for AWS or whatever the person set on the provider. A token for one audience is refused by another.
- `--subject-scope thread|project|organization` says who the token is. The default, `thread`, is the narrowest (`sub` is `thread:<id>`); `project` (`project:<id>`) and `organization` (`organization:<id>`) let a rule cover every thread of the project or workspace. Use the narrowest that the person's trust rule allows. Never widen it to make a rule match without asking.
- `--lifetime <seconds>` is 60 to 3600, default 600. Ask for what the command needs and no more.
- The claims are `iss`, `aud`, `sub`, `iat`, `nbf`, `exp`, `jti`, plus `organization_id`, `project_id`, `thread_id`, `user_id` and `email`. A service's rule decides what a token may do.

## Handling the token

- **It is a credential until it expires.** Pass it straight into the command that needs it (`--web-identity-token "$(aven id-token ...)"`, a header, a login). Never print it, never put it in a file, a commit, a reply, a log or a pull request, and never echo `$TOKEN`. Tool output is not hidden from the transcript for a value made at run time.
- Mint a fresh one when it is needed; do not keep one across a long task.
- To see what a token says without printing it, decode only its middle part:

  ```sh
  aven id-token --audience probe | cut -d. -f2 | python3 -c 'import sys,base64,json; s=sys.stdin.read().strip(); print(json.dumps(json.loads(base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))), indent=2))'
  ```

  Its `iss` is the issuer the provider must be given, and `sub` is what a trust rule matches.

## What the person sets up on the provider's side

You cannot do this from the sandbox. Walk the person through it with the exact values, and read the provider's own page for the field names, which differ.

1. **The issuer URL**, which is `iss` from a decoded token: `<the server's address>/api/workload-identity`. The provider fetches `<issuer>/.well-known/openid-configuration` and `<issuer>/jwks.json` itself, so the address has to be reachable from the provider. A server on a laptop or reachable only on a private network is not an issuer a public cloud can trust; one on the person's own network can serve services on that network.
2. **The audience**, which is the `--audience` value.
3. **A trust rule that matches on `sub`, or on `organization_id`.** Never one that matches only the issuer: every thread of every workspace on that server would get in. Match `thread:<id>`, `project:<id>` or `organization:<id>` to how wide the access should be, and give the role only the permissions the task needs.

The shape for each, not the exact fields:

- **AWS:** an IAM OIDC identity provider for the issuer and audience, and a role whose trust policy allows `sts:AssumeRoleWithWebIdentity` with a condition on `sub`. Then `aws sts assume-role-with-web-identity --role-arn <role> --role-session-name aven --web-identity-token "$(aven id-token --audience <audience>)"`.
- **Google Cloud:** a Workload Identity Pool with an OIDC provider for the issuer, an attribute mapping from `assertion.sub` (and `assertion.organization_id` if used) and a condition on it, and the pool allowed to impersonate a service account.
- **Vault:** a JWT auth method with the issuer's discovery URL, and a role with `bound_audiences` and `bound_claims` on `sub` or `organization_id`.
- **Tailscale and others:** a federated identity or OIDC trust for the issuer with the same `aud` and `sub` rules.
- **The person's own service:** verify the token's signature against the `jwks.json`, then check `iss`, `aud` and `exp`, and decide on `sub` or the claims.

## When it fails

- `this run has no identity to mint tokens with`: this is not a thread's run (a bot's computer, the setup container). Do it in a thread.
- `aven: command not found`: the sandbox image is older than the command. Ask the person to run `aven update` on the runner's machine (see `connect-github-and-runners`).
- The provider cannot fetch the issuer: the address is not reachable from the provider, or `BETTER_AUTH_URL` on the server is not the public address.
- The provider rejects the audience, the subject or the signature: compare the decoded `aud`, `sub` and `iss` with what the provider expects. A server with no `WORKLOAD_IDENTITY_PRIVATE_KEY` makes a new signing key on every restart, so a provider configured against it stops trusting it; an installed server has one in its `.env`.
- Expired: tokens last minutes; mint a new one.
- Never work around a refusal by asking for a broad key. Say what the provider rejected and what the person can change.
