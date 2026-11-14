# Troubleshooting

Start with `aven doctor`: it checks git, the server (and Docker, when a server is installed), the runner and its folders.

| What you see                                      | What to do                                                                                                                                                                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Docker is installed but not running`             | Only a server needs Docker: start Docker Desktop or OrbStack (macOS), or `sudo systemctl start docker` (Linux), then run the command again. A runner-only install (`--runner`) does not need it.                             |
| `Port 80 is in use` (or 443, or a port you named) | Pick another with `--port`, `--api-port` or `--https-port`.                                                                                                                                                                  |
| The server does not answer                        | `aven server logs`. The first start can take a minute; `aven restart` after editing `.env`.                                                                                                                                  |
| A runner shows Offline in Settings                | `aven runner status`, then `aven runner logs --follow` on that machine. `aven runner start` if it is stopped. A boat.dev runtime stays asleep until a thread needs it.                                                       |
| A boat.dev sandbox does not connect               | It has to reach this server at a public address. Set `AVEN_BOAT_RUNNER_URL` to `https://<your host>/api`. Localhost and private addresses are refused. A trial sandbox stops after two hours and the next thread resumes it. |
| `The control plane refused this runtime`          | The token was revoked or rotated, or the runner is older than the server (`Unsupported runtime version`): add a runtime again in Settings > Runtimes and run its command, or run `aven update` on the runner's machine.      |
| `Cannot reach the control plane`                  | The `--url` is wrong or blocked. It is the server's address followed by `/api`.                                                                                                                                              |
| `git` not found, or a thread cannot start         | Install git for the user who installed the runner and run `aven doctor`; the runner's log (`aven runner logs`) says which command failed.                                                                                    |
| A folder cannot be added or a thread will not run | The runner serves only the folders in `AVEN_DIRS` (its home by default). Run `aven runner install --dir <folder>` again to add one, then restart the runner.                                                                 |
| The runner is not in the list for a project       | A runner is private to its owner until they turn on Share in Settings > Runtimes; and a runner that is Offline cannot be used (see above).                                                                                   |

Where things are: `~/.aven/server/.env` (settings and secrets), `~/.aven/runner.env` (the runner),
`~/.aven/logs/runner.log`, the runner's workspaces in `~/.aven/runtime` (`AVEN_RUNTIME_HOME`), and the
database in the Docker volume `aven_postgres`. `AVEN_HOME` moves the settings, server files and logs
but not `AVEN_RUNTIME_HOME`, which has to be set as well to move the runner's workspaces.
