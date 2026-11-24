# keepsake

> Built on [davidvornholt/standards](https://github.com/davidvornholt/standards).

`keepsake` is a command-line tool that turns a folder of photos into a small album of beautiful ones. It is made for photographers who enjoy taking photos and not the evenings of sorting and editing that follow, and for the AI agents that run it for them.

1. It groups the photos into moments, such as a burst of a bird taking off.
2. A vision model finds the best frames of each moment, checks their focus at full size, and scores them. It takes more than one of a moment where they show clearly different things, such as another pose.
3. It leaves out repeats, keeps the most interesting of several photos that show the same thing again within a few minutes, and, when there are too many, compares the photos with each other and keeps the best, with a variety of places, people, animals and the rest.
4. It crops each one to an interesting composition, and an image model edits it. The frame may reach a little beyond the photo where a subject is cut off or has no room, and the image model continues the scene there. The edit also takes away what only distracts, such as strangers who aren't part of the scene, a chair or a sign at the edge, and you can tell it what else you want with `--wish`.
5. Image models redraw faces, so keepsake takes everyone who can be recognised from the photo itself. The vision model outlines them, keepsake puts their own pixels back into the edit, from inside up to where both show the same, and only their light follows the edit: brighter, darker, warmer or cooler over areas too large to change a feature. Small people in the background and in reflections come back as well, and so do the words on signs where the image model changed them, and the leaves of forests, which it turns into clumps. Image models also show a photo a little larger or further to a side, so keepsake first finds where an edit shows it.
6. The vision model reviews every edit against the original, and then looks through it part by part at full size for what would bother someone: a melted person, a woven lawn, a ghost, a seam. keepsake puts such a place back from the original and looks again. Where that doesn't help, where the subject, its pose, the people or the place changed, or where the edit isn't better, it asks for another, and in the end falls back to the camera's own picture.
7. It publishes the result to an album in [Immich](https://immich.app), each photo stacked on the camera's own picture.

keepsake never changes the photos themselves. Models see re-encoded pictures without metadata. The finished photos keep the camera's data, get a caption and a star rating, and carry IPTC's mark for photos edited with AI.

Image models invent detail. keepsake is for photos you want to look at, not for photos that have to prove something.

## Install

With Nix, use the flake's `packages.<system>.default`, which installs the `keepsake` command with the programs it needs and its agent skill in `share/keepsake/skills`.

From source on Linux, install [Bun](https://bun.sh), [ExifTool](https://exiftool.org) and [ImageMagick](https://imagemagick.org) 7, clone this repository, and run these commands in it:

```bash
bun install
bun run --filter @keepsake/cli install:user
```

Where [just](https://just.systems) is installed, `just install` runs the second command. The installer builds a standalone binary to `~/.local/bin/keepsake` and installs the agent skill to `~/.agents/skills`, where Codex and Claude Code find it. Run the commands again after pulling changes.

Publishing needs the [photos](https://github.com/davidvornholt/photos) command, signed in to your Immich.

## Sign in

GPT-6.2 Sol chooses and crops the photos through [Codex](https://developers.openai.com/codex). Claude Opus 5.5 describes the chosen ones, marks the people and signs in them and reviews the edits through [Claude Code](https://code.claude.com). Both run on the subscription their program is signed in to, with no tools and without saving the session. That counts towards the limits of the subscription instead of costing money per photo.

Edits use your own API key. With Azure, deploy `gpt-image-2.5-sunburst` under that name, then:

```bash
keepsake login azure --endpoint https://example.openai.azure.com
```

It asks for the key without showing it, or reads it from stdin, checks it, and saves it to `~/.config/keepsake/credentials.json`, readable only by you. `openai` works too, with `--image-model openai/<model>`. `keepsake status` shows what this machine is signed in to.

Other models can choose and crop with `--model`, and do the rest with `--review-model`. `azure`, `openai`, `anthropic` and `google` use an API key, such as `azure/gpt-6-astra`. A subscription's model thinks with medium effort unless its name ends with another one, such as `claude/claude-opus-5-5@high`. The model that culled a shoot also picks and crops its photos.

## Use

```bash
keepsake run ~/photos/lisbon --about "Lisbon, May 2026" --maximum 40 --budget 30 --publish
```

It can take hours. When it stops, run it again and it goes on where it stopped. Editing costs about $0.75 per photo. Culling costs nothing extra on a subscription, and about $2.50 per 100 photos with `azure/gpt-6-astra`. `--budget` limits what the edits cost.

`keepsake rate` and `keepsake bench` measure which vision model agrees best with your own taste: you rate some moments on a local page, and each model is compared with your ratings.

Run `keepsake --help` for the commands and `keepsake <command> --help` for their options. The skill in [`apps/cli/skills/keepsake`](apps/cli/skills/keepsake/SKILL.md) tells agents how to use them.

## Develop

`bun run check` runs the standards drift check, lint, type checks, tests, the build, and the accessibility checks of the rating page. It must pass before a change is done. Run the command from source with `bun apps/cli/src/app/cli.ts`.

## License

[MIT](LICENSE) © David Vornholt
