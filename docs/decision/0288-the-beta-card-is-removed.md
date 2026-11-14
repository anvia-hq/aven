# 0288. The beta card is removed

Status: accepted. Supersedes the hardcoded beta card of 0248.

The sidebar showed a card reading "Beta: Things change often and some parts are rough" until the person dismissed it. It took room above the machine monitor and the announcement banner for a message that no longer needs saying.

- The card, its `notices` module (`useNotice`) and its e2e spec are removed, with `public/beta-waves.jpg`.
- The server keeps `user_settings.dismissed_notices` and the `/preferences` routes, so no migration is made and a notice can return without one. Nothing in the web app reads them.
- Announcements (0252) are the way to tell people something from now on.
