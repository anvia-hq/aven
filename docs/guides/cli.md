# The `aven` command

```
aven install [--domain D] [--bind ADDRESS] [--port N] [--owner-email E]
                                                           server + runner on this machine
aven install --runner --url <address> --token <token>      only a runner
aven start | stop | restart | status | logs [--follow]     the server
aven runner start | stop | restart | status | logs | uninstall
aven update [--release X]
aven doctor                                                check git, the server (and Docker) and the runner
aven uninstall [--purge --yes]                             remove the services; --purge also deletes the data
```

`aven stop` keeps the database. Settings are in `~/.aven/server/.env`; edit it and run
`aven restart`. `--bind` is who can connect (this machine only unless a domain or `--bind` says
otherwise) and `--owner-email` is required for a server others can reach: see [Cloud](cloud.md). See [`deploy/env.example`](../../deploy/env.example) for what each one does.
