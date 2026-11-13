# A compiled Bun program loads the `.env` of the directory it is run in

Bun's standalone executables load `.env` and `bunfig.toml` from the working directory into `process.env` at start, unless built with `--no-compile-autoload-dotenv` and `--no-compile-autoload-bunfig`.

For `aven` this broke `aven update` and `aven restart` run from `~/.aven/server`: the old `AVEN_VERSION` of the server's `.env` was in the environment `aven` gave to `docker compose`, which prefers the environment to the `.env` file, so the new version was written to `.env` and the containers stayed on the old one while the command said the server was updated (seen on the beta, v0.8.17 to v0.8.19, and replayed in a throwaway install).

Workaround, both applied (decision 0260): the release binary is built with both flags, and the compose commands run without any variable the install's `.env` defines.
