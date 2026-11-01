# The default ports are not the usual development ones

Status: accepted. Extends 0073 (install and update with a script).

## Context

A new install published the web app on 3000, its API on 3030 and HTTPS on 3443. 3000 is where many development servers already listen, so the first install on a developer's machine was the one most likely to stop with "Port 3000 is in use".

## Decision

- The defaults are **2836** for the web app (it spells AVEN on a phone keypad), **2837** for the API on this machine and **2838** for HTTPS on this machine. They are below the range systems hand out for temporary connections, are registered to products no development tool uses, and are far from this repository's own development ports (8000, 5173, 8100, 5174). A domain install still uses 80 and 443.
- A port that the flags do not name is looked for: when its default is taken, the installer uses the next free port from the default up to 2899, and says which port it used instead. A port named with `--port`, `--https-port` or `--api-port` is used as given and has to be free.
- An install that exists keeps its ports: they are in its `.env`, which `aven update` never changes. Only missing keys take the template's values.

## Consequences

- A server installed before this one still answers on 3000 and 3030; nothing moves it. A GitHub App made for `http://localhost:3000` stays tied to that address, so changing an existing install's port means making the app again.
- The compose file's own defaults (`AVEN_PORT`, `AVEN_API_PORT`, `AVEN_HTTPS_PORT`) are the new numbers; an `.env` that sets them wins, as before.
