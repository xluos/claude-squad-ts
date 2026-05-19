# claude-squad-ts

A TypeScript / Bun / SolidJS + OpenTUI rewrite of [claude-squad](https://github.com/smtg-ai/claude-squad).

The original Go + bubbletea implementation has long-standing issues for CJK users:
- Chinese characters get layout/width wrong
- Terminal IME candidate box does not follow the input cursor — appears at row 0 col 0
- Command-line input feels unnatural (brittle paste, no grapheme handling)

This rewrite keeps the same model (1 git worktree + 1 tmux session per agent instance, state in `~/.claude-squad/state.json`) but builds the TUI on **SolidJS + OpenTUI** — the same stack opencode adopted after Ink couldn't deliver IME-correct input. OpenTUI's `<textarea>` is a Zig native renderable with built-in IME tracking, bracketed paste, wide-character widths, and a dedicated cursor manager.

## Why OpenTUI over Ink

- Ink runs JS-side cursor positioning through React effects, which run *after* Ink's commit phase — so the terminal cursor lags one frame behind, and on macOS the IME candidate floats up at the screen origin.
- OpenTUI's textarea positions the real terminal cursor synchronously inside the native renderer for every frame, so the system IME always anchors on the typed glyph.

## Status

Working port (v0.2). See `CLAUDE.md` for design notes and module map.

## Install (dev)

```bash
bun install
bun run dev
```

## Compatibility with the Go version

State file at `~/.claude-squad/state.json` uses the **same schema** as the Go version, so you can run either binary against the same instance store. Existing tmux sessions and worktrees keep working. The new `display_name` field (for CJK names) is optional and falls back to `title` when missing.

## License

MIT (matching upstream).
