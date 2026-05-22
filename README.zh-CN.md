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
- **`u` = 从基准分支同步下来** —— 反方向 merge：把当前任务的基准分支 fold 进 worktree，长时间跑的 agent 也能吃到其他实例合入的基建变更。先 `git merge-tree` dry-run；冲突就 toast 文件数，不会让 worktree 卡在 MERGING
- **per-instance 基准分支 chip** —— Diff tab 上 "based on …" 标签按 instance 创建时锚定，不再随 host 当前分支漂（host `git checkout` 切走后也不会骗人）
- **每仓库状态 + worktree 隔离** —— 在不同目录打开 claude-squad 不再共享会话列表，每个 repo 独立的 `projects/<id>/state.json` 和 worktree 池。老 `~/.claude-squad/state.json` 首次启动自动迁移
- **合并时自动 commit dirty 改动** —— 如果合并时工作树有未提交改动，overlay 会提示，并自动先 commit 到源分支再合并（跟原本暂停时的自动 commit 行为对齐）
- **`T` = tmux 管理面板** —— 浮窗列出所有 tmux 当前在跑的 `claudesquad_*` 会话，每行标注 tracked / orphan / attached、前台命令、时长。`d` 删除选中，`a` 一键清理所有 orphan。底部常驻 `tmux N (+M orphan)` 指示器，orphan 累积时变黄，被遗忘的会话不再藏起来
- **帮助 overlay 跟真实快捷键对齐** —— `HelpOverlay.tsx` 是唯一来源，老的 `HELP_BINDINGS` 死代码已清理

## 安装

> 依赖 **Bun** ≥ 1.2 + **tmux**。`s` 推 PR 流程需要 `gh` CLI。

### 从 npm 装

```bash
bun install -g claude-squad-ts
# npm 也能装，但运行时 Bun 必须在 PATH 上：
npm install -g claude-squad-ts
```

装好后有 `cs` 命令（跟原版对齐）和 `claude-squad-ts` 长名。打包产物的 shebang 是 `#!/usr/bin/env bun`，并且 OpenTUI 渲染器用 `bun:ffi` 加载 Zig 库 —— 没有 Node 兜底。

### 从源码装

```bash
git clone https://github.com/xluos/claude-squad-ts
cd claude-squad-ts
bun install
bun run build
# 然后 `bun run start`，或者 `bun link` 把 `cs` 暴露到全局
```

### 前置依赖

- [Bun](https://bun.sh) ≥ 1.2（仅 Bun —— OpenTUI 用 `bun:ffi`，没 Node 兜底）
- [tmux](https://github.com/tmux/tmux/wiki/Installing)
- [gh](https://cli.github.com/)（可选，只有 `s` 推 PR 需要）
- 你要用的代理本身：`claude` / `codex` / `gemini` / `aider`，至少一个在 PATH 上

## 用法

```bash
cs                  # 在当前 git 仓库里启动
cs -p "aider"       # 覆盖默认 program
cs -y               # 自动接受所有提示（auto-yes）
cs --lang zh        # 单次强制中文 UI
cs debug            # 打印配置路径 + 当前项目 + 项目注册表
cs reset            # 清空**当前项目**保存的实例
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
| `i`                  | 不接入会话、直接向运行中的会话发送一段提示词                      |
| `s`                  | 提交并把分支推到 GitHub                                           |
| `c`                  | 切出：提交改动、暂停会话、复制分支名到剪贴板                      |
| `r`                  | 恢复已暂停的会话（错误状态下则用于重启 tmux）                     |
| `m`                  | 合并工作树分支到主分支（代理继续跑）                              |
| `M`                  | 合并并关闭实例 —— 合并完清理 tmux / worktree / branch             |
| `a`                  | Apply —— 把分支 squash 成单个 commit 合入主分支，再关闭实例       |
| `u`                  | 从基准分支同步下来 —— 把 host 的新提交拉进当前 worktree           |
| `tab`                | 在 Preview 和 Diff 之间切换                                       |
| `shift+↑` / `shift+↓`| 滚动 preview / diff（Esc 退出滚动模式）                           |
| `T`                  | 打开 tmux 管理面板 —— 查看 / 删除我们启动的活跃 tmux 会话         |
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

### commit message 钩子（hooks）

默认情况下，集成相关的几个流程会用写死的 `[claudesquad] …` 文案提交。你可以把文案生成委托给一个外部程序（比如某个 AI commit 信息工具），覆盖四个 commit 点位：

| 点位          | 提交的是什么                                                     |
| ------------- | --------------------------------------------------------------- |
| `merge`       | `m` / `M` 合并到主分支的 merge commit                           |
| `squashApply` | `a`（apply）流程里 squash 出的那一个 commit                     |
| `autoCommit`  | merge / apply 前，折叠工作树脏改动的那次自动提交                |
| `sync`        | `u` 从 host 反向同步到 worktree 的 merge commit                |

钩子运行时 **cwd 设为正在提交的那个仓库 / worktree，且改动已经 stage、尚未 commit**，所以程序自己读暂存区即可（比如 `git diff --cached`）。它的 **stdout 会被原样当作 commit message**。

```jsonc
{
  "hooks": {
    "commit_message": {
      "command": ["commitmsg"],   // argv 数组，无 shell 直接 spawn；应用到所有点位
      "timeout": 30,               // 秒；默认 30
      "overrides": {               // 单点位覆盖 —— 优先级高于通用配置
        "sync": { "enabled": false },                            // 单独关掉某个点位
        "squashApply": { "command": ["commitmsg", "--squash"] }  // 单独给某个点位换命令
      }
    }
  }
}
```

- 完全不写 `hooks`（默认）→ 保持内置 `[claudesquad] …` 文案，行为不变。
- **非零退出 / 超时 / 空输出都会中止本次操作** —— 不提交任何东西，仓库会回滚（`git merge --abort` / `reset --hard HEAD`），不会卡在合并到一半的状态。修好钩子再重试即可。
- 有 `command` 时 `enabled` 默认 `true`；设成 `false`（通用或单点位）即可关闭。

> `pause` 的自动提交（`[claudesquad] auto-commit on pause of …`）**故意不走**钩子：暂停是高频生命周期操作，外部钩子在这里失败会把"暂停一定成功"变成"暂停可能失败"。

## 远程控制（在飞书 / 手机上操作会话）

claude-squad 的每个会话本质就是一个跑着 agent CLI 的 tmux pane。把这个 program 换成 [`agent-remote-core`](https://github.com/xluos/agent-remote-core) 的前台 server，每个会话就会额外发布一份结构化的终端快照 —— [`agent-remote`](https://github.com/xluos/agent-remote) 的飞书 bridge（也就是 `cla` / `cl` / `cx` 快捷命令背后的同一套后端）能读这份快照并反向操作。于是你离开电脑后，还能在手机上盯着、回复正在跑的 agent。

这套方案取代了老的 `claude-squad-ts-remote` 镜像 daemon（现已[归档](https://github.com/xluos/claude-squad-ts-remote)）—— 现在桥接是零成本的，不用再单独守一个进程。

```
  claude-squad tmux pane
    └─ agent-remote-core serve --foreground   ← 透明地跑你的 claude/codex
         ├─ stdout 透传  → claude-squad 的 Preview tab（照常显示）
         └─ pyte 快照    → /tmp/remote-claude/<session>.mq （mmap + unix socket）
                              ▲
                              └─ agent-remote 飞书 bridge → 手机上的卡片
```

**配置步骤**

1. 装 daemon（Python ≥ 3.9）：

   ```bash
   pip install agent-remote-core
   # 或：uv tool install agent-remote-core
   ```

2. 把 claude-squad 的 program 指向前台 server。在 claude-squad 的 tmux pane 里运行时，它会自动用 tmux session 名作为 daemon session 名，默认跑 `claude`：

   ```jsonc
   {
     "default_program": "agent-remote-core serve --foreground"
   }
   ```

   要跑 Codex、或者混用多个 agent，用 profiles：

   ```jsonc
   {
     "profiles": [
       { "name": "claude", "program": "agent-remote-core serve --foreground" },
       { "name": "codex",  "program": "agent-remote-core serve --foreground --cli-type codex" }
     ]
   }
   ```

3. 配置并启动飞书 bridge（一次性向导，约 5 分钟），来自 [`agent-remote`](https://github.com/xluos/agent-remote)：

   ```bash
   agent-remote lark init      # 向导：创建机器人应用、开权限、写配置
   agent-remote lark start     # 后台跑起 bridge
   ```

4. 在飞书里打开机器人，发 `/list` 看到你的 `claudesquad_*` 会话，再 `/attach <会话名>` 就能看实时输出、点选项 / 权限按钮 —— 和 `cla` 体验一致，只不过操作的是 claude-squad 起的会话。

如果你想自己做面板而不用飞书，这套 PTY 宿主运行时也能单独用 TypeScript [`@agent-remote/sdk`](https://www.npmjs.com/package/@agent-remote/sdk) 消费。

## 磁盘布局

```
~/.claude-squad/
├── global_state.json                  # 项目注册表 + 已看 help 位图 + migration 版本
├── config.json
├── projects/
│   └── <sha256(repoPath)[:16]>/
│       ├── state.json                 # 这个项目的实例
│       └── worktrees/                 # 这个项目新建的 worktree
└── state.json.legacy.bak              # 仅当从 v0.2.3 之前的版本迁移过来才会出现
```

projectID = `sha256(repoPath)[:16]`，其中 `repoPath` 是 git worktree 顶层路径（所以 `~/proj` 和 `~/proj-other-worktree` 是两个不同的项目，跟 cwd 直觉一致）。

## 跟 Go 版的兼容性

- **状态布局跟上游 Go 的项目隔离重构对齐** —— `projects/<id>/state.json` 和 `global_state.json` 的字段都遵循上游 `config/global_state.go` / `session/project_storage.go` 定义，两个二进制能互读对方的状态。
- **`display_name`** 是我们加在 instance 上的字段（可选），让中文名能在列表里显示，同时底层 `title` 保持 kebab-case ASCII（tmux session 名 / git 分支 / 文件路径都干净）。
- **`base_branch_name`** 是 worktree 数据里我们加的字段（`u` 同步 + Diff tab chip 用），缺失时首次启动用 `git branch --contains <base_sha>` 兜底回填，一次启动就补上。
- **老数据迁移**：第一次启动新版时，旧的单文件 `~/.claude-squad/state.json` 会被按项目拆到上面的目录结构里。原文件重命名为 `state.json.legacy.bak` 留作回退；用 `global_state.last_migration_version` 锁定一次性，不会重跑。

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
