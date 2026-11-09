# Settings keeps General and Profile apart

Status: accepted.

## Context

Settings > Profile held two things that are not the same: the account form (name, email) with the
preferences that follow it, and nothing else. It was also the page Settings opened, and where every
`Cmd+,` and every "Personal settings" menu item went. What a person has done — the threads they
began, how long the longest one ran, the days they worked in a row, the tokens they spent — had no
page of its own, and the settings frame is where a person looks for it.

## Decision

- Settings > General is the account form and the preferences (`/settings/general`). Settings, the
  user menu and `Cmd+,` open it, and `/settings` redirects there; a page only an owner may see sends
  everyone else there too.
- Settings > Profile (`/settings/profile`) is the person's own page: their avatar, name and a handle
  taken from the name, their threads, the longest thread, their longest and current streaks, a year of
  days coloured by the tokens of each, and every day's tokens as an area chart. Its Edit button goes
  to General, where the name is changed.
- The numbers come from the transcript the control plane already keeps (`agent_memory_messages`
  and `agent_memory_sessions`), not from a new table: the tokens of a day are the `totalTokens` each
  assistant message carries, grouped by day in the person's timezone, over the sessions of the
  threads they began and of their own chats. `GET /profile/stats` returns them.
- A handle is not stored. `handleOf` in the platform takes the letters and digits of the name, and
  the email's local part when the name has none.

## Consequences

- Nothing is migrated, and a year of work that Aven already holds shows on the page the first time
  it is opened.
- The counts are what the transcript still holds: compacting a thread replaces the messages before
  the summary, so the tokens of those messages stop being counted, and a deleted thread's are not
  counted at all.
- A person with no runs sees an empty heatmap and a chart that says the first thread starts it,
  rather than a fabricated line.
