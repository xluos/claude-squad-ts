# claude-squad-ts

A TypeScript / Bun / Ink rewrite of [claude-squad](https://github.com/smtg-ai/claude-squad).

The original Go + bubbletea implementation has long-standing issues for CJK users:
- Chinese characters get layout/width wrong (column math uses runewidth which still misses some emoji/CJK)
- Terminal IME candidate box does not follow the input cursor — appears at row 0 col 0
- Command-line input feels unnatural (no proper grapheme handling, brittle paste)

This rewrite keeps the same model (1 git worktree + 1 tmux session per agent instance, state in `~/.claude-squad/state.json`) but builds the TUI on **Ink 7** which provides `useCursor` + `usePaste` hooks designed specifically for IME-correct cursor placement, plus `Bun.stringWidth` + `Intl.Segmenter` for correct CJK width math.

## Status

Early port. See `CLAUDE.md` for design notes and module map.

## Install (dev)

```bash
bun install
bun run dev
```

## Compatibility with the Go version

State file at `~/.claude-squad/state.json` uses the **same schema** as the Go version, so you can run either binary against the same instance store. Existing tmux sessions and worktrees keep working.

## License

MIT (matching upstream).
