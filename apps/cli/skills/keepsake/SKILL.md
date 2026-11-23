---
name: keepsake
description: Turn a folder of the user's photos, such as a trip or a birding day, into a small album of finished ones with the keepsake command, which lets vision models choose the best frames, crops and edits them with an image model, and publishes them to Immich. Use when the user wants a shoot culled, its best photos chosen, rated, cropped or edited with AI, or finished photos published, or wants to compare how well vision models judge their photos. Not for photos already in Immich, which the photos skill covers.
---

# keepsake

Run `keepsake <command> --help` for options. Output is JSON on stdout, progress is JSON lines on stderr, and errors are JSON on stderr, `{"error":{"tag","message"}}`, with exit 1, or 2 for invalid arguments.

keepsake only reads the folder of photos and never changes it. What it makes is in the `folder` that `keepsake shoots` prints.

## Before starting

- The photos are the user's private life, and keepsake sends them to the provider of the model, so use it only on a folder the user's own message names. Never copy photos or what they show into files, commits or issues.
- Where the user has a subscription, let it judge the photos: `--model claude/<model>` asks Claude Code and `--model codex/<model>` asks Codex, each on the subscription its program is signed in to. That costs nothing extra but counts towards the limits of the subscription. When one is reached, the rest of the photos are listed as failed; run the same command again later. Whether a provider may train on the photos depends on the account's privacy settings.
- Everything else costs money. With the usual models, culling costs about $2.50 per 100 photos, and editing about $0.75 per photo. Scanning is free, so scan first, tell the user what the rest will cost, and go on when they have agreed to it or named a budget. `--budget` limits the edits of one command and nothing else. keepsake counts a model whose price it doesn't know (`dollars` is 0 under `models` although tokens were used) as free, so there the budget has no effect.
- If a command reports `NotSignedIn`, ask the user to run `keepsake login <provider>` in their own terminal (for Azure with `--endpoint <address of the resource>`), or to sign in to Claude Code or Codex. Never ask for the key in the chat, and never read or print the credentials file.

## From a folder to an album

`keepsake run <folder> --about "<place, month and year>"` does everything up to the edits, and `--publish` also uploads them. `--about` tells the models where the photos are from, so always give it. When the trip was in another time zone than the camera's clock, which is the usual case when the time on the photos doesn't fit the light in them, give `--time-zone <such as Asia/Tokyo>` too, so the finished photos carry the time there. Run it in the background: 900 photos take about an hour to cull, and each edit takes a few minutes. When it stops for any reason, run the same command again and it goes on where it stopped.

The steps are also commands of their own, for a shoot that `scan` has named:

1. `scan <folder>` reads the photos and groups them into moments, such as a burst.
2. `cull` finds the best frames of each moment and scores it from 1 to 10. Most good photos get 6 or 7; from 8 on they are for the wall.
3. `pick` takes the photos from `--minimum-score` on and leaves out repeats. With `--maximum` it compares them with each other and keeps the best.
4. `edit` crops each pick where that makes it stronger, makes `--versions` of it, puts the people of the original back into them, and has them reviewed. People who can be recognised keep their own pixels and get only the light of the edit, so their features can't change. Where no version passes, it keeps the camera's own picture, listed under `keptFromCamera` with the reason.
5. `publish` uploads the finished photos to an album in Immich, each stacked on the camera's own picture and tagged `keepsake`. Publish only when the user asks for it.

`show <shoot>` says where a shoot stands and where the files are, and `show <shoot> <photo>` gives everything about one photo. Look at a few finished photos yourself before you call them done, and at every one with people, close up and beside the camera's picture: their edges should look natural, with no halo and no second outline.

## Changing the result

- Other or more photos: run `pick` with another score or maximum, then `edit` and `publish` again. Photos already edited stay. For photos that weren't picked, such as another frame of a burst, name them: `edit <shoot> <photo...>` and `publish <shoot> <photo...>`.
- Another attempt at a photo: `edit <shoot> <photo> --again`, then `publish`. The earlier upload stays in Immich and its id is listed under `outdated`; show it to the user and ask before trashing it with the photos command.

## Comparing vision models

`keepsake rate <shoot>` serves a page where the user chooses the best photo of each moment and gives it stars, 60 moments of up to 12 photos unless `--moments` says otherwise. Pass the `--model` that culled the shoot, so that the sample has moments of every score. Start it in the background, give the user the printed address, and stop it when they are done. Never rate for them. The page is for this machine. When the user sits at another one, pass it on in a private network, such as with `tailscale serve --bg --https=<port> http://127.0.0.1:<port of --port>`, give `rate` that `--address`, and turn it off again afterwards.

`keepsake bench <shoot> --model <provider/model> --model …` then asks each model about the rated moments, at the price of culling them (nothing extra on a subscription):

- `sameBestFrame` is how often the model chose the user's best frame of a burst, and `bestFrameByChance` how often guessing would.
- `keepAccuracy` is how often a photo the user would keep (3 stars or more) scored above one they would not; 0.5 is guessing. Use this to choose a model.
- `rankCorrelation` compares the order of all scores with the order of the stars, from -1 to 1.

Below 30 rated moments a small difference between models means nothing.
