# CLAUDE.md — claude-squad-ts

TypeScript / Bun / **SolidJS + OpenTUI** rewrite of [claude-squad](https://github.com/smtg-ai/claude-squad).
原版用 Go + bubbletea，在 CJK 渲染、命令行交互、IME 候选框跟随上有顽固问题。
我们最初用 Ink + React 重做了一版，但 Ink 的 `useCursor` 在嵌套布局里光标定位 race 始终调不顺；
**v0.2 直接换 SolidJS + OpenTUI**，跟 opencode 同一套 —— OpenTUI 的 `<textarea>` 是 Zig native，
IME + paste + 光标全是开箱即用的。

## 关键设计决定（不要随意改）

1. **TUI 栈固定 SolidJS + OpenTUI**：
   - `@opentui/core` —— Zig native renderer，包含 `<box>` `<text>` `<textarea>` `<scrollbox>` 等内建元素
   - `@opentui/solid` —— SolidJS 渲染绑定，提供 `render()` + 钩子（`useTerminalDimensions` `useKeyboard` `useRenderer` `usePaste`）
   - `solid-js` —— 状态原语（`createSignal` `createMemo` `createEffect` `createStore`）
2. **输入框 = OpenTUI `<textarea>` 内建**：
   - 不要自己写 buffer / cursor / IME 处理。`<textarea>` 自带宽字符宽度、IME-aware cursor、bracketed paste、undo/redo、选择、submit
   - 唯一要做的：拿 `ref` 调 `.focus()` / `.blur()` / 读 `.plainText`
   - **提交时双 setTimeout 让 IME flush 末位字符**（opencode 同款 hack）
3. **JSX 配置**：tsconfig `jsx: "preserve"` + `jsxImportSource: "@opentui/solid"`，
   bunfig.toml `preload = ["@opentui/solid/preload"]` 在运行时把 JSX 用 babel-preset-solid 转成 Solid 调用
4. **PTY**：claude / aider / 用户 program 用 `@lydell/node-pty`（Bun 兼容）；
   attach 时停掉 OpenTUI renderer 让 stdin 让给 tmux，detach 后重启 renderer
5. **存储兼容原 Go 版** `~/.claude-squad/state.json`（字段名 / 类型 / enum 数值一致），
   `display_name` 字段是 v0.1 引入的可选字段，旧数据缺失时 fallback 用 `title`
6. **shell 命令一律 spawn argv 数组**，不要拼字符串
7. **日志走 `src/shared/logger.ts`**，不要引入 console.log

## 目录

```
src/
  cli/         入口 + commander 子命令（root TUI / debug / reset / version / daemon）
  app/         顶层状态 + Root SolidJS 组件
    state.ts        createStore + reducer-shaped helpers
    App.tsx         状态机 + 布局
  session/
    instance.ts     Instance 实体 + 生命周期 (Start / Pause / Resume / Kill)
    storage.ts      state.json 读写
    git/            worktree 操作、diff、branch 搜索（spawn git CLI）
    tmux/           tmux 子进程管理 + capture-pane 解析 + 交互 attach
    llm/            translator.ts —— CJK 名称翻译成 kebab-case ASCII
  ui/
    components/     List / Menu / TabbedWindow / Preview / Diff / ErrorBox
    overlays/       ConfirmationOverlay / HelpOverlay
  daemon/      autoyes 子进程
  shared/      paths / config / state / logger / keymap / styles / constants / types
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
| `ui/overlay/*`        | `src/ui/overlays/*`                    |
| `keys/keys.go`        | `src/shared/keymap.ts`                 |
| `config/*`            | `src/shared/{config,state,paths}.ts`   |
| `daemon/*`            | `src/daemon/*`                         |
| `cmd/cmd.go`          | `src/cli/index.ts`                     |
| `log/*`               | `src/shared/logger.ts`                 |

## 写代码注意

- 函数式 + Solid 原语，避免 class 组件（除了 Instance / TmuxSession 这种业务实体）
- 异步全部 async/await
- 数据结构用 interface + 工厂函数
- 改 `~/.claude-squad/state.json` 后立即 save（保留原 Go 版的"操作后立刻 save"不变量）
- Solid 反应性陷阱：不要在响应式追踪外解构 props，要保留访问器（`props.foo` 而不是 `const {foo} = props`）
