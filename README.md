# claude-squad-ts

> TypeScript / Bun / SolidJS + OpenTUI rewrite of [**smtg-ai/claude-squad**](https://github.com/smtg-ai/claude-squad) — a terminal app that manages multiple Claude Code / Codex / Gemini / Aider sessions, each in its own git worktree + tmux session.

[![npm version](https://img.shields.io/npm/v/claude-squad-ts.svg)](https://www.npmjs.com/package/claude-squad-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**English** | [简体中文](./README.zh-CN.md)

---

This project is a **direct port** of the original Go + bubbletea implementation. The session model, on-disk state, and command surface are kept compatible — but the TUI is rebuilt on a stack that's actually friendly to CJK users.

## Why a rewrite

The original is great, but had a few friction points for CJK users and i18n in general:

| Issue (Go original)                                  | claude-squad-ts                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| CJK characters got width / layout wrong              | OpenTUI's Zig renderer handles wide-character widths natively          |
| Terminal IME candidate box pinned to row 0 col 0     | OpenTUI's `<textarea>` positions the real terminal cursor synchronously, so the system IME anchors on the typed glyph |
| Input felt brittle (paste, undo, grapheme handling)  | OpenTUI textarea is a native renderable with built-in bracketed paste, undo/redo, and IME tracking |
| English-only UI                                      | Built-in **中文 / English** i18n — `config.json` `"language": "zh" / "en" / "auto"` |

## Highlights / what we added on top

- **Theme-aware colors** — all semantic UI colors (success / danger / warning / muted / status / diff) emit as ANSI indexed escapes (`\x1b[38;5;Nm`), so reds / greens / yellows blend with your terminal's Solarized / Dracula / Catppuccin / Ghostty palette instead of looking like hardcoded hex
- **Mouse-clickable rows + tabs** — click an instance to select it, click `Preview` / `Diff` to switch tabs
- **Mouse-wheel scroll on Preview / Diff** — `shift+↑/↓` still works for keyboard scrolling
- **Floating overlays + toast banners** — modals don't replace the main view anymore; they float over it with their own solid background so the list / preview stays visible. Success / error banners pop top-center and auto-dismiss
- **Commit-divergence indicators** — list rows show `↑N` (commits ahead of host) and `↓N` (commits the host moved on without you), so you know when to rebase
- **Capital `M` = merge & retire** — lowercase `m` merges and keeps the agent running; uppercase `M` merges and immediately cleans up tmux / worktree / branch
- **Auto-commit on merge** — if the worktree is dirty when you merge, the overlay warns you and auto-commits the pending changes to the source branch first (matches the existing auto-commit-on-pause behavior)
- **Help overlay reflects actual keymap** — single source of truth in `HelpOverlay.tsx` (the old dead `HELP_BINDINGS` mirror is gone)
- **State.json schema unchanged** — you can run either binary against the same `~/.claude-squad/state.json` if you want to A/B them

## Install

> Requires **Bun** ≥ 1.2 and **tmux**. `gh` CLI is needed for the `s` (push & open PR) flow.

### From npm

```bash
npm install -g claude-squad-ts
# or
bun install -g claude-squad-ts
```

This installs the `cs` binary (matching the original) and a longer `claude-squad-ts` alias.

### From source

```bash
git clone https://github.com/xluos/claude-squad-ts
cd claude-squad-ts
bun install
bun run build
# then either run `bun run start`, or `bun link` to expose `cs` globally
```

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.2 (or Node 20+ to run the built JS)
- [tmux](https://github.com/tmux/tmux/wiki/Installing)
- [gh](https://cli.github.com/) (optional, for `s` push-PR flow)
- A working `claude` / `codex` / `gemini` / `aider` on your `PATH`, depending on which agent you want to launch

## Usage

```bash
cs                  # launch in the current git repo
cs -p "aider"       # override the default program
cs -y               # auto-yes mode (forwards Yes to interactive prompts)
cs --lang zh        # force Chinese UI for this run
cs debug            # print config paths
cs reset            # wipe all stored instances
```

### Keymap

| Key                  | Action                                                            |
| -------------------- | ----------------------------------------------------------------- |
| `n`                  | Create a new session                                              |
| `N`                  | Create a new session with a prompt                                |
| `d`                  | Delete (kill) the selected session                                |
| `↑` / `k`, `↓` / `j` | Navigate between sessions                                         |
| `K` / `J`            | Reorder selected session up / down                                |
| `↵` / `o`            | Attach to the selected session                                    |
| `Ctrl+Q`             | Detach from an attached session (or `tmux prefix + d`)            |
| `s`                  | Commit changes and push branch to GitHub                          |
| `c`                  | Checkout: commit, pause session, copy branch name to clipboard    |
| `r`                  | Resume a paused session                                           |
| `m`                  | Merge worktree branch into host branch (agent keeps running)      |
| `M`                  | Merge & retire — merge, then clean up tmux / worktree / branch    |
| `tab`                | Switch between Preview and Diff tabs                              |
| `shift+↑` / `shift+↓`| Scroll preview / diff (Esc to exit scroll mode)                   |
| `?`                  | Show full help                                                    |
| `q` / `Ctrl+C`       | Quit                                                              |

Mouse: click instance rows to select, click tab labels to switch, wheel-scroll inside Preview / Diff.

## Configuration

Config lives at `~/.claude-squad/config.json` (same path as the Go version):

```jsonc
{
  "default_program": "claude",
  "auto_yes": false,
  "daemon_poll_interval": 1000,
  "branch_prefix": "myname/",
  "language": "auto"        // "zh" | "en" | "auto"; auto reads $LANG / $LC_ALL
}
```

### Profiles

You can define multiple named programs and switch between them when creating a new session with `N`:

```jsonc
{
  "profiles": [
    { "name": "claude",  "program": "claude" },
    { "name": "codex",   "program": "codex" },
    { "name": "aider",   "program": "aider --model anthropic/claude-sonnet-4" }
  ]
}
```

When more than one profile is defined, the new-session overlay shows a profile picker you cycle with `tab`.

## Compatibility with the Go version

- **State file at `~/.claude-squad/state.json` uses the same schema** — fields, enum values, and types all match upstream. You can switch back and forth between the two binaries against the same state without conflicts.
- **`display_name`** is the only added field — optional, used so CJK names render in the list while the underlying `title` stays kebab-case ASCII (which keeps tmux session names / git branches / file paths clean).
- **State file fallback**: when `display_name` is missing (data written by the Go version), the UI falls back to `title`.

## Architecture

Boot path: `src/cli/index.ts` → `src/cli/tui.ts` (creates OpenTUI renderer + Solid root) → `src/app/App.tsx` (state machine + layout).

Domain split:

```
src/
  cli/          CLI entry, subcommands (debug, reset, version, daemon)
  app/          Top-level Solid component + reducer-shaped store
  session/      Instance lifecycle, storage, git, tmux, LLM-based name translator
  ui/
    components/ List, Menu, TabbedWindow, Preview, Diff, Logo, PausedView, ErrorBox
    overlays/   Confirmation, Help, Merge, Onboarding
    util/       ANSI parser (preview color rendering)
  daemon/       autoyes background process
  shared/       paths, config, state, logger, keymap, styles, i18n, types, constants
```

Why **SolidJS + OpenTUI** over Ink + React:

- Ink runs JS-side cursor positioning through React effects, which run *after* Ink's commit phase — so the terminal cursor lags one frame behind, and on macOS the IME candidate floats up at the screen origin.
- OpenTUI's textarea positions the real terminal cursor synchronously inside the native renderer for every frame, so the system IME always anchors on the typed glyph.

This is the same stack [opencode](https://github.com/sst/opencode) adopted for the same reason.

## Development

```bash
bun run dev          # run TUI directly from source
bun run check        # tsc --noEmit + biome
bun run lint:fix     # auto-fix formatting / lint
bun run build        # bundle to dist/ for distribution
bun test
```

See `CLAUDE.md` for module-level design notes.

## Credits

- Upstream design and product flow: [smtg-ai/claude-squad](https://github.com/smtg-ai/claude-squad) — please go star the original.
- Renderer: [@opentui](https://github.com/sst/opentui)

## License

[MIT](LICENSE) — matching upstream.
