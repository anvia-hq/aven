# Bots have a generated avatar

Status: accepted. Builds on 0058. The characters, their picker and their tests come from the Anvia harness (`apps/web/src/modules/bots/services/avatar.ts`, `bot-avatar.tsx`, `avatar-picker.tsx`; its decision 0034).

## Context

A bot's avatar was a text the person typed, an emoji, and empty meant the first letter of its name. Every bot looked alike until someone changed it, and the main bot can now make more bots (0060), which would all be the same grey letter. The harness already draws each bot as a small character.

## Decision

- **Every bot has a character**, drawn as an SVG in the platform: a shape (12 of them), a color (12) and a face (4), picked from a seed. The seed is the bot's id until the person chooses another, so a bot looks the same on every screen and visit and every bot looks its own, with no migration and no state to keep. Random, without anyone having to choose.
- **The person can change it**: from the avatar at the top of the bot's settings, a picker with two tabs. Bot picks a shape and a color, each shown on the bot as it is; Generate shows fifteen random characters and Shuffle draws fifteen more; Reset goes back to the one the id draws. A shape or color picked alone leaves the face and the bob to the seed, as in the harness.
- **How it is kept**: `bots.avatar`, the column that held the emoji, now holds the setting as JSON, `{"seed"?, "family"?, "color"?}`, checked on the platform when it is read (`parseAvatarSetting`: a shape is 3 to 12 lowercase letters, a color `#rrggbb`, a seed 1 to 64 characters); empty means none was chosen. The limit grows from 16 to 120 characters (`BOT_AVATAR_MAX`). The control plane keeps the text as given, as it did the emoji, so a client that draws something else (the macOS client) reads the same string. An avatar that is plain text, from before this, is still shown as the text until the person picks a character.
- **Bots do not choose it**: `create_bot` no longer takes an avatar (it took an emoji, which would have replaced the random character with a letter-like glyph), and `bot.create` carries none. A bot the main bot makes has the character its id draws.
- **Colors**: the twelve are palette data kept with the bot, in `avatar.ts`, not theme colors, so the color rule of 0004 does not apply to them; the face's ink is the token `avatar-face`. The avatar bobs gently, each at its own time (not inside the picker, where about thirty at once would be too much); with reduced motion it stands still.

## Known limits

- The four faces draw as three: `curious` and `glance` differ only in where the pupils look, which shows only while a bot works, and that state is not here. They are kept so that a seed draws the same character as in the harness.
- `data-family` and `data-color` on the avatar's svg are there for the e2e tests.

## Not taken from the harness

- **Upload and moods**: the harness lets a person upload a picture, which needs somewhere to keep and serve images, and animates a bot while it works or sleeps. Neither is here: there is no image storage, and the bot's typing state is in the chat, not the sidebar.
