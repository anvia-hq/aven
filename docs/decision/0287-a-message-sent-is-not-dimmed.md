# 0287. A message sent is not dimmed

Status: accepted. Supersedes the dimming in 0098 and 0117.

A message the person sends shows at once, before the server answers, and a message sent while the agent works shows as queued. Both were drawn faded (60% and 70% opacity, the queued one on a paler background), so each looked unfinished until it settled.

- A sending or queued message is drawn exactly as a delivered one, with the same background and full opacity.
- It stays optimistic: it still appears at once, and `aria-busy` marks a message still being sent.
- A queued message keeps its line "Queued: the agent reads it at its next step", which is how it differs from a delivered one.
