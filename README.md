# keepsake

> Built on [davidvornholt/standards](https://github.com/davidvornholt/standards).

`keepsake` is a command-line tool that turns a folder of photos into a small album of beautiful ones. It is made for photographers who enjoy taking photos and not the evenings of sorting and editing that follow, and for the AI agents that run it for them.

1. It groups the photos into moments, such as a burst of a bird taking off.
2. A vision model finds the best frames of each moment, checks their focus at full size, and scores them.
3. It leaves out repeats and, when there are too many, compares the photos with each other and keeps the best.
4. It crops each one where that makes it stronger, and an image model edits it.
5. The vision model reviews every edit against the original. Where the subject, its pose, the people or the place changed, or the edit isn't better, keepsake asks for another, and in the end falls back to the camera's own picture.
6. It publishes the result to an album in [Immich](https://immich.app), each photo stacked on the camera's own picture.

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

keepsake uses your own API key. With Azure, deploy `gpt-6-astra` and `gpt-image-2.5-sunburst` under those names, then:

```bash
keepsake login azure --endpoint https://example.openai.azure.com
```

It asks for the key without showing it, or reads it from stdin, checks it, and saves it to `~/.config/keepsake/credentials.json`, readable only by you. `openai`, `anthropic` and `google` work too: choose models with `--model` and `--image-model`, such as `anthropic/claude-opus-5-5`. Anthropic's and Google's models can judge photos but not edit them here.

## Use

```bash
keepsake run ~/photos/lisbon --about "Lisbon, May 2026" --maximum 40 --budget 30 --publish
```

It can take hours. When it stops, run it again and it goes on where it stopped. With the models above, culling costs about $2.50 per 100 photos and editing about $0.75 per photo. `--budget` limits what the edits cost.

`keepsake rate` and `keepsake bench` measure which vision model agrees best with your own taste: you rate some moments on a local page, and each model is compared with your ratings.

Run `keepsake --help` for the commands and `keepsake <command> --help` for their options. The skill in [`apps/cli/skills/keepsake`](apps/cli/skills/keepsake/SKILL.md) tells agents how to use them.

## Develop

`bun run check` runs the standards drift check, lint, type checks, tests, the build, and the accessibility checks of the rating page. It must pass before a change is done. Run the command from source with `bun apps/cli/src/app/cli.ts`.

## License

[MIT](LICENSE) © David Vornholt
