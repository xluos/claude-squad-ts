# claude-squad-ts

> [**smtg-ai/claude-squad**](https://github.com/smtg-ai/claude-squad) 的 TypeScript / Bun / SolidJS + OpenTUI 重写版 —— 一个在 git worktree + tmux 中同时管理多个 Claude Code / Codex / Gemini / Aider 会话的终端工具。

[![npm version](https://img.shields.io/npm/v/claude-squad-ts.svg)](https://www.npmjs.com/package/claude-squad-ts)
[![npm downloads](https://img.shields.io/npm/dm/claude-squad-ts.svg)](https://www.npmjs.com/package/claude-squad-ts)
[![Release](https://github.com/xluos/claude-squad-ts/actions/workflows/release.yml/badge.svg)](https://github.com/xluos/claude-squad-ts/actions/workflows/release.yml)
[![Provenance](https://img.shields.io/badge/provenance-verified-success?logo=github)](https://www.npmjs.com/package/claude-squad-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](./README.md) | **简体中文**

---

直接移植自原版 Go + bubbletea 实现。会话模型、磁盘上的 state、命令面板都保持兼容 —— 唯一换掉的是 TUI 渲染栈，换成了一个对中文用户实际友好的方案。

## 为什么要重写

原版很棒，但对 CJK 用户和 i18n 有几处摩擦：

| 原版 Go 的问题                              | claude-squad-ts                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| 中文字符宽度计算错乱、布局错位               | OpenTUI 的 Zig 渲染器原生处理宽字符                                     |
| 终端 IME 候选框永远定在 row 0 col 0          | OpenTUI 的 `<textarea>` 在原生层同步控制真实终端光标，IME 自然锚定到输入位置 |
| 输入体验脆（粘贴丢字符、撤销有问题、grapheme 处理粗糙）| OpenTUI textarea 是原生 renderable，自带 bracketed paste / undo / redo / IME 跟踪 |
| 全英文界面                                   | 内置 **中文 / English** i18n —— config.json `"language": "zh" / "en" / "auto"` |

## 我们在原版基础上做的优化

- **跟终端主题走的颜色** —— 所有语义色（success / danger / warning / muted / status / diff）都用 ANSI indexed 转义（`\x1b[38;5;Nm`）输出，红绿黄会跟你 Solarized / Dracula / Catppuccin / Ghostty 的调色板融合，不再是写死的 hex
- **鼠标可点的实例行 + tab** —— 点会话行选中，点 `Preview` / `Diff` 切 tab
- **Preview / Diff 鼠标滚轮滚动** —— 同时保留键盘 `shift+↑/↓`
- **浮层 modal + toast 通知** —— modal 不再覆盖整个屏幕，而是浮在主界面上方（自带不透明背景遮住下面）；成功 / 错误通知从顶部居中浮现，自动消失
- **commit 分歧指示** —— 实例行显示 `↑N`（领先主分支 N 个 commit）和 `↓N`（主分支前进了 N 个 commit），知道什么时候该 rebase
- **大写 `M` = 合并后关闭实例** —— 小写 `m` 合并后保留代理继续跑；大写 `M` 合并完直接清理 tmux / worktree / branch
- **合并时自动 commit dirty 改动** —— 如果合并时工作树有未提交改动，overlay 会提示，并自动先 commit 到源分支再合并（跟原本暂停时的自动 commit 行为对齐）
- **帮助 overlay 跟真实快捷键对齐** —— `HelpOverlay.tsx` 是唯一来源，老的 `HELP_BINDINGS` 死代码已清理
- **state.json schema 跟 Go 版完全一致** —— 你可以拿任一个二进制对同一份 `~/.claude-squad/state.json` A/B 测试

## 安装

> 依赖 **Bun** ≥ 1.2 + **tmux**。`s` 推 PR 流程需要 `gh` CLI。

### 从 npm 装

```bash
npm install -g claude-squad-ts
# 或
bun install -g claude-squad-ts
```

装好后有 `cs` 命令（跟原版对齐）和 `claude-squad-ts` 长名。

### 从源码装

```bash
git clone https://github.com/xluos/claude-squad-ts
cd claude-squad-ts
bun install
bun run build
# 然后 `bun run start`，或者 `bun link` 把 `cs` 暴露到全局
```

### 前置依赖

- [Bun](https://bun.sh) ≥ 1.2（或 Node 20+ 来跑打包后的 JS）
- [tmux](https://github.com/tmux/tmux/wiki/Installing)
- [gh](https://cli.github.com/)（可选，只有 `s` 推 PR 需要）
- 你要用的代理本身：`claude` / `codex` / `gemini` / `aider`，至少一个在 PATH 上

## 用法

```bash
cs                  # 在当前 git 仓库里启动
cs -p "aider"       # 覆盖默认 program
cs -y               # 自动接受所有提示（auto-yes）
cs --lang zh        # 单次强制中文 UI
cs debug            # 打印配置路径
cs reset            # 清空所有保存的实例
```

### 按键表

| 键                   | 行为                                                              |
| -------------------- | ----------------------------------------------------------------- |
| `n`                  | 创建新会话                                                        |
| `N`                  | 创建新会话（带提示词）                                            |
| `d`                  | 删除选中的会话                                                    |
| `↑` / `k`, `↓` / `j` | 在会话间导航                                                      |
| `K` / `J`            | 上移 / 下移选中的会话                                             |
| `↵` / `o`            | 接入选中的会话                                                    |
| `Ctrl+Q`             | 从已接入的会话退出（或者 `tmux prefix + d`）                      |
| `s`                  | 提交并把分支推到 GitHub                                           |
| `c`                  | 切出：提交改动、暂停会话、复制分支名到剪贴板                      |
| `r`                  | 恢复已暂停的会话                                                  |
| `m`                  | 合并工作树分支到主分支（代理继续跑）                              |
| `M`                  | 合并并关闭实例 —— 合并完清理 tmux / worktree / branch             |
| `tab`                | 在 Preview 和 Diff 之间切换                                       |
| `shift+↑` / `shift+↓`| 滚动 preview / diff（Esc 退出滚动模式）                           |
| `?`                  | 完整帮助                                                          |
| `q` / `Ctrl+C`       | 退出                                                              |

鼠标：点实例行选中、点 tab 标签切 tab、在 Preview / Diff 里滚轮滚动。

## 配置

配置在 `~/.claude-squad/config.json`（路径跟 Go 版一致）：

```jsonc
{
  "default_program": "claude",
  "auto_yes": false,
  "daemon_poll_interval": 1000,
  "branch_prefix": "myname/",
  "language": "auto"        // "zh" | "en" | "auto"；auto 读 $LANG / $LC_ALL
}
```

### 多 profile

可以预设多个程序，按 `N` 创建会话时切换：

```jsonc
{
  "profiles": [
    { "name": "claude",  "program": "claude" },
    { "name": "codex",   "program": "codex" },
    { "name": "aider",   "program": "aider --model anthropic/claude-sonnet-4" }
  ]
}
```

定义了多个 profile 后，新建会话的 overlay 会显示 profile 选择器，`tab` 切换。

## 跟 Go 版的兼容性

- **`~/.claude-squad/state.json` 用同样的 schema** —— 字段、enum 值、类型都跟上游对齐。同一份 state 可以来回切两个二进制跑，不冲突。
- **`display_name`** 是我们新加的字段（可选），让中文名能在列表里显示，同时底层 `title` 保持 kebab-case ASCII（tmux session 名 / git 分支 / 文件路径都干净）。
- **回退兼容**：当 `display_name` 缺失（Go 版写的数据），UI 自动回退用 `title`。

## 架构

启动路径：`src/cli/index.ts` → `src/cli/tui.ts`（创建 OpenTUI renderer + Solid root）→ `src/app/App.tsx`（状态机 + 布局）。

模块划分：

```
src/
  cli/          CLI 入口、子命令（debug、reset、version、daemon）
  app/          顶层 Solid 组件 + reducer 风格的 store
  session/      实例生命周期、存储、git、tmux、LLM 中英名翻译
  ui/
    components/ List, Menu, TabbedWindow, Preview, Diff, Logo, PausedView, ErrorBox
    overlays/   Confirmation, Help, Merge, Onboarding
    util/       ANSI 解析器（preview 颜色还原）
  daemon/       autoyes 后台进程
  shared/       paths, config, state, logger, keymap, styles, i18n, types, constants
```

**为什么 SolidJS + OpenTUI 而不是 Ink + React**：

- Ink 用 React effect 跑 JS 侧的光标定位 —— 这发生在 Ink commit 之后，所以终端光标永远比渲染晚一帧；macOS 下 IME 候选框直接飘到屏幕左上角。
- OpenTUI 的 textarea 每一帧都在原生 renderer 里同步设置真实终端光标，系统 IME 始终锚在你正在输入的字符位置。

这是 [opencode](https://github.com/sst/opencode) 出于同样原因切到的同一套栈。

## 开发

```bash
bun run dev          # 直接跑源码
bun run check        # tsc --noEmit + biome
bun run lint:fix     # 自动修复格式 / lint
bun run build        # 打包到 dist/
bun test
```

模块级设计笔记见 `CLAUDE.md`。

## Credits

- 上游设计与产品流：[smtg-ai/claude-squad](https://github.com/smtg-ai/claude-squad) —— 顺手去原项目点个 star。
- 渲染器：[@opentui](https://github.com/sst/opentui)

## License

[MIT](LICENSE) —— 跟上游对齐。
