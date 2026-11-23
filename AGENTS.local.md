# Project-specific rules

- keepsake only reads the folder of photos it is given. Everything it makes goes to `$XDG_DATA_HOME/keepsake` and, with `publish`, to Immich.
- Pictures go only to the model providers the user named, re-encoded and without metadata, so no position, date or serial number leaves the machine. Use `developed` or `rendered` for every picture a model sees.
- An edit may invent detail and light, but the subject, its pose, the people and the place stay what they were. The prompt asks for that and the review checks it; change both together.
- keepsake talks to Immich only through the `photos` command and never deletes anything there.
- Every command picks up where it stopped. Write results with `atomically` as soon as they exist, because each one cost money.
- `shared/subscriptions` runs the programs of Claude Code and Codex without tools, settings, instructions of the machine, or a saved session, and never with an API key, so photos stay out of session files and nothing is billed. Keep it so when their options change.
- Prices in `shared/spending.ts` and the sizes in `features/edit/geometry.ts` belong to the models; check both when a model is added.
- No photo, server address, Azure resource or other personal detail belongs in this public repository. Tests use `example.openai.azure.com`, and no test reaches a real model.
- Keep the skill in `apps/cli/skills/keepsake/SKILL.md` in step with the commands.
