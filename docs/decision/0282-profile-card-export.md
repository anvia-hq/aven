# Profile card export

Status: accepted

## Context

Settings > Profile shows what a person did: their identity, stats, a year of activity
and a tokens chart. There is no way to take that picture elsewhere, and a DOM
screenshot cannot keep a fixed 4:5 card from a page whose height changes with the data.

## Decision

Add a `Download PNG` button beside `Edit profile`. It redraws the same profile data
onto a fixed 1080x1350 canvas with the app's own helpers (`heatmapWeeks`, `levelOf`,
`seriesOf`) and CSS variables, and downloads it as a `<handle>-profile-4x5.png`.

## Consequences

The card always matches the theme but is a drawing, not the DOM, so a change to the
page layout needs the same change in `profile-capture.ts` to stay alike.
