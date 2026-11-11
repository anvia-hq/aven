# A pending image is not loaded lazily

Status: accepted.

## Context

A message sent with an image shows at once from a `data:` URL (decision 0126). The image was marked `loading="lazy"`, so the browser deferred it to a later frame. The message showed first as text and the picture appeared a few milliseconds after, moving the thread.

## Decision

- An image that comes from a local preview loads eagerly and decodes synchronously.
- An image from the server keeps lazy loading.

## Consequences

- The picture and the text appear in the same frame.
- When the server's own message replaces the pending one, the image is fetched from the artifacts path and can still flash. That swap is not changed here.
