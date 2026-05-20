# Contributing to claude-squad-ts

Thanks for considering a contribution! This project is a community port — issues, PRs, and reports of weird behavior are all welcome. Both English and 中文 are fine.

## Reporting issues

- **Bug reports** — please use the [bug report template](./.github/ISSUE_TEMPLATE/bug_report.md). Include your OS, terminal emulator (Ghostty / iTerm / Alacritty / …), `cs version` output, and the minimum reproducer.
- **Feature requests** — use the [feature request template](./.github/ISSUE_TEMPLATE/feature_request.md). Mention whether the upstream Go version already does this (we try to stay compatible).

## Dev setup

```bash
git clone https://github.com/xluos/claude-squad-ts
cd claude-squad-ts
bun install
bun run dev       # runs the TUI from source
```

Other commands:

```bash
bun run check     # tsc --noEmit + biome
bun run lint:fix  # auto-fix formatting / lint
bun run build     # bundle into dist/
bun test
```

We use **Bun**, not npm / pnpm — the lockfile and `bunfig.toml` assume Bun. The build emits a single bundle via `scripts/build.ts`.

## Code style

- TypeScript everywhere, `strict: true`.
- SolidJS reactivity — don't destructure props (`const {x} = props` breaks tracking). Use `props.x` or `() => props.x`.
- No `console.log` — use `log` from `@/shared/logger`.
- Shell commands are argv arrays, never concatenated strings.
- No emojis in code or docs unless the user explicitly asks for them.

Project-level conventions live in `CLAUDE.md`. Read it before writing anything non-trivial — it has design rationale you'll want to know.

## Commit messages

Conventional Commits, lowercase scopes:

```
feat(merge): merge worktree → host + paused UX + visual polish
fix(persistence): mark restored instances as started
ci: drop NODE_AUTH_TOKEN — Trusted Publisher OIDC takes over
docs: add Chinese README
```

Common types: `feat`, `fix`, `ui`, `refactor`, `chore`, `docs`, `ci`, `build`, `test`.

## Pull request flow

1. Fork the repo, branch off `master`.
2. Make changes. Keep PRs focused — one logical change per PR.
3. Run `bun run check` before pushing — CI will run the same thing.
4. Open the PR. The [PR template](./.github/PULL_REQUEST_TEMPLATE.md) prompts for summary and test plan; please fill it out.
5. If your change affects user-visible UI text, update both English and Chinese entries in `src/shared/i18n.ts`.

## Release process

Maintainer only:

```bash
npm version patch -m "chore(release): v%s"
git push origin master --follow-tags
```

The `release.yml` workflow handles the rest: build → `npm publish` via OIDC trusted-publisher (no token) → GitHub release with auto-generated notes.

## Code of conduct

Be civil, be concise, and assume good faith. We don't have a separate CoC file yet; defer to the [Contributor Covenant](https://www.contributor-covenant.org/) spirit.
