# 0317: The subscriptions lead the Providers page as cards

Date: 2026-11-16

Status: accepted. Follows 0309, which made a subscription a provider row like any other.

## Decision

- Settings > Providers opens with a "Subscription plans" section: Claude subscription and Codex
  subscription as two large cards side by side (`sm:grid-cols-2`), each with a 14-unit logo tile, a
  larger title, its description and one prominent "Set up" button. Above and below the section the
  page keeps its list rows and its rules.
- A card is always shown, whether or not the person has that subscription: unconnected it offers
  "Set up", connected it shows the credential's detail line with the same actions as a row
  (refetch models, make default, edit, remove) and a "Connected" mark. The subscription therefore
  never appears twice.
- A subscription whose backend flag is off (`AVEN_CLAUDE_BACKEND`, `AVEN_CODEX_BACKEND`) gets no
  card and, if one is already connected, stays in the "Connected" list with its "Subscription"
  badge, so a person who turned the backend off keeps a way to see and remove what they have.
- The module grows two optional props, not new primitives: `ProviderLogo` takes a size
  (`sm` | `lg`) and `ProviderDialog` a `prominent` trigger (a default `lg` button instead of an
  `outline` `xs` one). Everything else is layout with the semantic tokens.

## Why

The two subscription kinds are not another model API: a thread on one runs the vendor's own agent
(Claude Agent SDK, Codex SDK) with a credential the person already has, and a person with a Claude
or Codex plan is the likeliest visitor to this page. As a row among eleven it read as one more key
to paste in. As a card it says what it is before the list of keys starts.

Keeping the card when the subscription is connected, rather than letting it drop out of the
offering list, is what makes the prominence stable: the section does not shrink to one card or
vanish once the person does what the page asks.

## Consequences

- The page's first section is the two cards; "Connected" and "Add a provider" follow as before.
- A connected subscription is no longer a row, so its row-level detail (its address, model and key
  hint) is now one line in the card's footer.
- The e2e specs that find a provider by `listitem` and "Set up" keep working: a card is a `li`
  named after its label, and its trigger still reads "Set up".
- A third hosted backend would be one more entry in `FEATURED` and one more card.
