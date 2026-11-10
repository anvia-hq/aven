# A person uploads their own photo

Status: accepted.

## Context

`users.image` existed and the avatar components drew it, but nothing set it: every person was initials. A person could not choose how they appear to the others in the workspace.

## Decision

- Settings > General, under Account, has a photo: Upload photo (Change photo and Remove once there is one). The browser crops it to a centered square of 256 px and saves it as WebP, or JPEG where the browser cannot encode WebP, so what leaves the browser is small.
- `PUT /profile/avatar` takes the image bytes of one person's own photo and `DELETE /profile/avatar` removes it. The server accepts only PNG, JPEG or WebP, told by the bytes and not by what the upload says, of at most 256 KB, and answers 422 otherwise. A GIF or an SVG is refused.
- The photo is a row of `user_avatars` (bytes and type, one per person, removed with the person). `users.image` is set to `/api/users/<id>/avatar?v=<time>`, a path of this server, so every place that draws `image` (the sidebar's account, the members list, a mention, the profile) shows it with no other change, and a new upload changes the address and so the cache.
- `GET /users/:id/avatar` needs a session and answers only for the person themselves and for someone who shares a workspace with them, and 404 otherwise. It is served with `nosniff` and a year of private caching, which the version in the address makes safe.

## Consequences

- The image is stored in the database next to the person, so it is backed up and removed with them and needs no file store.
- `users.image` is a relative path. A client that is not served from the same origin as `/api` (the native apps) has to join it to the server's address.
- A thread's author label and the participants of the sidebar still draw initials: they do not carry the image yet.
