# Contributing to Aven

Outside contributions are welcome.

## License

Contributions are made under the [Apache License 2.0](LICENSE), the license of the project.

## Developer Certificate of Origin

Aven uses the [Developer Certificate of Origin](https://developercertificate.org/) (DCO). Every commit must be signed off with a `Signed-off-by:` line:

```sh
git commit -s
```

A check on every pull request fails when a commit has no sign-off. To add it to commits you have already made, run `git rebase --signoff main` and push again.

## Working on the code

`AGENTS.md` has the commands, the constraints and the working style. Run `bun run typecheck`, `bun run lint`, `bun run format` and the tests for what you changed before opening a pull request, and open it against `main`.
