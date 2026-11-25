# Project-specific rules

- keepsake only reads the folder of photos it is given. Everything it makes goes to `$XDG_DATA_HOME/keepsake` and, with `publish`, to Immich.
- Pictures go only to the model providers the user named, re-encoded and without metadata, so no position, date or serial number leaves the machine. Use `developed` or `rendered` for every picture a model sees.
- An edit may invent detail and light, but the subject, its pose, the people and the place stay what they were. The prompt asks for that and the review checks it; change both together.
- Neither a prompt nor a mask stops an image model from redrawing a face, and a review doesn't notice it reliably. So `features/edit/people` takes every person who can be recognised from the original and changes only their light. Never let a person's pixels through from an edit. Its constants were chosen by looking at real photos, and the tests only hold the basics, so look at a close portrait and at whole people in front of a busy background when you change one.
- keepsake talks to Immich only through the `photos` command and never deletes anything there.
- The page (`features/light-table`) does itself only what costs nothing and is easily undone: it notes what the owner says on it, sets favorites in Immich, gets a new album ready by running `keepsake run --unedited`, and forgets one that nothing was made from. Edits and what is in the album wait for an agent, which the page may start after the hand-over. It has no login, so it listens on 127.0.0.1 only, answers only under its own address and the one it was told, and reads only folders below those it was given.
- What the page and the server send each other is in `contract.ts` and `schemas.ts`. `revision.ts` decides when the page reads a shoot again, so add a file there when the page shows something new from it.
- Every command picks up where it stopped. Write results with `atomically` as soon as they exist, because each one cost money.
- `shared/subscriptions` runs the programs of Claude Code and Codex without tools, settings, instructions of the machine, or a saved session, and never with an API key, so photos stay out of session files and nothing is billed. Keep it so when their options change.
- Prices in `shared/spending.ts` and the sizes in `features/edit/geometry.ts` belong to the models; check both when a model is added.
- No photo, server address, Azure resource or other personal detail belongs in this public repository. Tests use `example.openai.azure.com`, and no test reaches a real model.
- Keep the skill in `apps/cli/skills/keepsake/SKILL.md` in step with the commands.
