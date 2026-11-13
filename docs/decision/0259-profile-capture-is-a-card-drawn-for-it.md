# The profile capture is a card drawn for it, not a picture of the page

Status: accepted. Builds on 0176 (the profile page and its activity).

## Context

Settings > Profile should let a person download their profile as an image for sharing. The first try photographed the live page and scaled it into a 4:5 canvas. The page is wide and short, so the picture was stretched into a tall frame with empty bands, and the heatmap was cut off at the right edge. A 4:5 image needs a layout made for that shape, not a crop or a stretch of the page.

## Decision

- **The capture is its own card.** `ProfileCaptureCard` (`components/profile-capture-card.tsx`) is laid out at 540 x 675 CSS pixels, downloaded at two times that, so the file is 1080 x 1350. It shows the avatar, name and handle, the four statistics, the activity heatmap with its month labels, and the tokens with their chart. It reads the same data as the page and reuses the page's pure helpers (`activity.ts`) and heatmap colours (`LEVELS`), so the two cannot disagree on a number.
- **It is mounted only while a capture is made.** `useProfileCapture` sets `requested`, the route portals the card to `document.body` for the length of the render, `html-to-image` draws it to a PNG, and the card is removed again. A card left in the page would repeat the name, the handle and the statistics, and the page's own tests (and a screen reader) would see them twice.
- **The button waits for the statistics.** Download Capture is disabled until the stats have loaded, so a file is never made of placeholders.
- **`html-to-image` is the one new dependency** (MIT, no other dependencies), agreed before it was added.

## Consequences

- A change to the page's layout does not change the capture; a change to the statistics, the heatmap or the chart must be made in the card too.
- The capture shows the last 371 days of activity and the total tokens over that window, as the page does. Threads and the longest thread are all-time.
- The card is 540 px wide, so its text is small in the browser's own pixels; the download is twice as large, so it reads at 1080 px.
- Not built: a choice of size or ratio, a capture of the other settings pages, and a share link.
