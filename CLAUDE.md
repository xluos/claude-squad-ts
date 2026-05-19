# CLAUDE.md — claude-squad-ts

TypeScript / Bun / Ink 重写版的 [claude-squad](https://github.com/smtg-ai/claude-squad)。
原版用 Go + bubbletea，在 CJK 渲染、命令行交互、IME 候选框跟随上有顽固问题。
本项目用 **Ink 7 + React 19 + Bun** 重做 TUI，原则上行为 1:1 等价。

## 关键设计决定（不要随意改）

1. **Ink 必须 ≥ 7.0**：`useCursor` + `usePaste` 是 IME 修复的根。`ink-text-input` 的 chalk.inverse 伪光标方案 *永远不要* 引入。
2. **CJK 宽度永远用 `Bun.stringWidth` / `string-width`**，*绝对不要* 用 `s.length` 做光标列号算术。
3. **Grapheme 切分用 `Intl.Segmenter`**，不要按 char index 走。
4. **PTY：**
   - 子进程（claude / aider / 用户 program）的 PTY 用 `@lydell/node-pty`。
   - TUI 自己的 stdin **不走 PTY**，让 Ink 的 raw-mode 直接读 `process.stdin`，否则 IME 定位会再叠一层错。
5. **存储完全兼容原 Go 版的 `~/.claude-squad/state.json`**（字段名、类型、enum 数值一致），方便从 Go 版迁移。
6. **不引入 console.log / console.error**：所有日志走 `src/shared/logger.ts`，统一写 `os.tmpdir()/claudesquad.log`。
7. **shell 命令一律 spawn argv 数组，不要拼 shell 字符串**，避免 quoting / 注入。

## 目录

```
src/
  cli/         入口 + commander 子命令（root TUI / debug / reset / version / daemon）
  app/         顶层状态机、Root React 组件
  session/
    instance.ts        Instance 实体 + 生命周期 (Start / Pause / Resume / Kill)
    storage.ts         state.json 读写
    git/               worktree 操作、diff、branch 搜索
    tmux/              tmux 子进程管理 + capture-pane 解析 + monitor
  ui/
    components/        List / Menu / TabbedWindow / Preview / Diff / Terminal / ErrorBox
    overlays/          TextInput / Confirmation / Help / BranchPicker / ProfilePicker
    input/             MultilineInput（IME-friendly）
    hooks/             useTerminalSize、useDebouncedEffect 等
  daemon/      autoyes 子进程
  shared/      paths / config / state / logger / keymap / styles / constants / types
  web/         Web 仪表盘（后期）
```

## 常用命令

```bash
bun install
bun run dev          # 直接跑 TUI（开发模式）
bun run check        # tsc --noEmit + biome
bun run lint:fix
bun test
bun run build        # 产物到 dist/
```

## 与原 Go 版的对照

| Go 模块                | TS 对照                                |
| --------------------- | -------------------------------------- |
| `app/app.go`          | `src/app/App.tsx` + `src/app/state.ts` |
| `session/instance.go` | `src/session/instance.ts`              |
| `session/storage.go`  | `src/session/storage.ts`               |
| `session/git/*`       | `src/session/git/*`                    |
| `session/tmux/*`      | `src/session/tmux/*`                   |
| `ui/list.go`          | `src/ui/components/List.tsx`           |
| `ui/menu.go`          | `src/ui/components/Menu.tsx`           |
| `ui/tabbed_window.go` | `src/ui/components/TabbedWindow.tsx`   |
| `ui/preview.go`       | `src/ui/components/Preview.tsx`        |
| `ui/diff.go`          | `src/ui/components/Diff.tsx`           |
| `ui/terminal.go`      | `src/ui/components/Terminal.tsx`       |
| `ui/overlay/*`        | `src/ui/overlays/*`                    |
| `keys/keys.go`        | `src/shared/keymap.ts`                 |
| `config/*`            | `src/shared/{config,state,paths}.ts`   |
| `daemon/*`            | `src/daemon/*`                         |
| `cmd/cmd.go`          | `src/cli/index.ts`                     |
| `log/*`               | `src/shared/logger.ts`                 |

## 写代码注意

- TS 文件优先函数式 + React hooks，不要写 class 组件。
- 异步全部 async/await，避免 .then 链。
- 给 Instance / Worktree / TmuxSession 等数据结构都用接口 + 工厂函数，避免 class（除非必须）。
- 任何对 `~/.claude-squad/state.json` 的修改都要立即持久化，原版有"操作后立刻 save"的不变量。
