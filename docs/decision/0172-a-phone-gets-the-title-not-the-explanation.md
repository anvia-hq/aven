# A phone gets a page's title, not the sentence explaining it

Status: accepted.

## Context

The tab bar gave a phone somewhere to go, and the screens it went to still read as a desktop's.
Every page opened with the same pair: a heading set at 24 or 32px, and a sentence under it saying
what the page was for. At 390px that sentence broke over three or four lines — "Pull requests and
commits across all your projects, read from GitHub." — and the heading took a line of its own at a
size meant for a 1400px column. On Settings, Profile and Center that was a third of the screen
before any content, all of it text you read once. The Projects header was worse: it truncated the
sentence mid-word instead.

## Decision

- A page's explaining sentence is drawn from `md` up and not below it: `SettingsPage`,
  `PageHeader` and Center's header keep it in the document but hide it under 48rem. What the page
  is for is said by the page itself — the fields, the cards, the empty state.
- Headings that open a page are `text-xl` on a phone and `text-2xl` from `md` up
  (`SettingsPage`, `CockpitPage`, Center, the new-thread page), so a title is a title and not a
  banner.
- The app bar over the page carries no title of its own: the tab bar says which app you are in and
  the page below says what it is. Before this, Center and Projects said their name twice, once grey
  and once large.
- The Center page's filter chips stay on one line and scroll sideways under 48rem rather than
  wrapping into two or three rows; the quick views already did.
- Settings' sections are packed a little tighter on a phone (`py-6` and a 3 gap instead of `py-8`
  and 4).

## Consequences

- On a phone a page starts with its title and its content within about 100px of the top of the
  page, and nothing repeats what the tab bar already says.
- A sentence that explains a page is unavailable on a phone; where the reason matters, it belongs
  in the empty state of the thing it explains, which is where a person meets it.
- Nothing changes from 768px up: the sentences, the 24px headings and the wrapping chip rows are
  as they were.
- The e2e specs read pages at a wide viewport, so they see the sentences and headings unchanged.
