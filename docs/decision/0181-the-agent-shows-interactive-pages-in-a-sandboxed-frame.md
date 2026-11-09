# 0181: The agent shows interactive pages in a sandboxed frame

Status: accepted. Carries on from 0136 (the agent shows images and videos), which it extends.

## Context

An agent often has something better explored than read: a chart to hover, a comparison with tabs, a table to sort, a calculator. A picture or a paragraph loses that. Fixed components (a chart block with a JSON spec) cover charts only, and the agent can write any page itself, so the work is running what it wrote without letting it touch the app.

## Decision

- **A page is an artifact.** `show_artifact` takes an HTML file (`text/html`, up to 2 MiB) beside images and videos, told by its first bytes (`<!doctype html` or `<html`), never its name. It is one self-contained file: scripts and styles inline, data embedded, no network. The agent bundles its own libraries (React included) into it in its sandbox, and the instructions tell it to open and use the page there before showing it. The runner keeps a copy as it does an image, so the page loads after the sandbox is released (wire version 53).
- **The control plane serves it sandboxed.** `GET /threads/:id/artifacts/:name` answers an HTML page with `Content-Security-Policy: sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'`. `sandbox` without `allow-same-origin` gives the page an opaque origin, so it reads no cookie, storage or parent page and calls no API of ours, even when someone opens the URL directly; `connect-src 'none'` and the other sources leave it nowhere to send what it can see. The page is never served in pieces.
- **The platform draws it in an iframe** with `sandbox="allow-scripts"` and no referrer, in the conversation as wide as the text, with an Expand button that opens it large. The access rule is the images': whoever may read the thread.
- **A small bridge makes it part of the page.** The control plane puts one script first in the page's `<head>`. It tells the platform the page's height, so the frame grows to fit (80 to 900 px; a page that sets its own height on `html` stays that tall), and it receives the app's colors as CSS variables on `:root` (`--aven-background`, `--aven-foreground`, `--aven-muted`, `--aven-muted-foreground`, `--aven-border`, `--aven-primary`, `--aven-accent`, `--aven-radius`) and the light or dark scheme, again whenever the theme changes. The platform accepts a message only from its own frame's window and the page only from its parent; neither carries anything but sizes and colors.
- **A page that does not load says so**, after eight seconds without the bridge's first message, with a retry.
- **The instructions** have an `<interactive>` section: when to build a page and not an image, the one-file and no-network rules, the variables, and checking it first.

## Consequences

- A runner and a control plane must both be 53 (an older control plane would refuse the new media type).
- The page's code is the model's, run in the viewer's browser: the sandbox flags and the CSP are the whole defence. Do not add `allow-same-origin`, `allow-top-navigation`, `allow-forms` or `allow-popups`, or open the CSP's sources, without a decision that replaces this one.
- The page cannot read the thread. Data goes in when the agent writes it. A later decision may add an approved read over the bridge.
- A page costs a bundling step in the sandbox, and the model does not see what it shows (0033).
- The Swift clients draw no page; they have the artifact's name and caption only.
