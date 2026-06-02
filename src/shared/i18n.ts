/**
 * Tiny in-process i18n. English is the source of truth — its shape defines
 * `Messages`, so the Chinese table must implement every key or TypeScript
 * complains at compile time (no silent fallback to undefined at runtime).
 *
 * Language is picked once at startup from config (`config.language`) and
 * cached in this module — no runtime hot-switch. Callers use:
 *
 *   import { t } from '@/shared/i18n';
 *   <text>{t(m => m.help.pressAnyKey)}</text>
 *   store.setError(t(m => m.toast.instanceLimit)(MAX_INSTANCES));
 *
 * The callback form gives IDE jump-to-definition, refactor-rename, and
 * static checks for typos — no stringly-typed `t('help.pressAnyKey')`.
 */

import type { MergeBlocker } from '../session/git/merge.js';

export type Lang = 'en' | 'zh';
export type LangSetting = Lang | 'auto';

const EN = {
  app: {
    /** Subtitle under the ASCII logo identifying the TS port. */
    logoSubtitle: '« TypeScript edition »',
    logoStack: 'SolidJS · OpenTUI · Bun',
  },
  list: {
    instancesChip: ' Instances ',
    autoYesChip: ' auto-yes ',
    noSessions: 'No sessions yet.',
    hintName: 'name a new session',
    hintPrompt: 'start one with a prompt',
    hintHelp: 'full help',
    willBeCreated: '(will be created)',
    translatingName: 'Generating name…',
    creatingInstance: 'Creating session…',
  },
  tabs: {
    preview: 'Preview',
    diff: 'Diff',
    switchHint: 'tab / shift+tab to switch',
  },
  preview: {
    emptyCapture: '(empty)',
    pressNToCreate: 'Press n to create a new session — N for one with a prompt',
    errorPrefix: (msg: string) => `Error: ${msg}`,
    errorRecover: 'Session encountered an error — press r to restart tmux, d to delete',
    scrollFooter: (offset: number) => `-- scroll mode (offset ${offset}) — Esc to follow tail --`,
  },
  diff: {
    selectToView: 'Select an instance to view diff',
    noChanges: 'No changes yet',
    scrollFooter: (offset: number) => `-- scroll mode (offset ${offset}) — Esc to top --`,
  },
  paused: {
    title: 'Session paused',
    headlinePreview: 'worktree checked out, tmux frozen',
    headlineDiff: 'worktree removed, no diff to compute',
    branchLabel: 'branch  ',
    branchPreserved: '  (preserved)',
    whatNow: 'What now',
    actions: {
      resumeTitle: 'resume',
      resumeDesc: 'recreate worktree, reattach agent',
      submitTitle: 'submit PR',
      submitDesc: 'push this branch upstream',
      mergeTitle: 'merge',
      mergeDesc: 'fold branch into your host branch',
      killTitle: 'kill',
      killDesc: 'drop branch + worktree entirely',
    },
  },
  placeholder: {
    newName: 'Name new session (中文也可)…',
    prompt: 'Prompt for new session (中文也可)…',
  },
  sendPrompt: {
    header: 'Send to',
    placeholder: 'Type a prompt — Enter to send, Shift+Enter for newline…',
    hint: '↵ send  ·  Shift+↵ newline  ·  Esc cancel',
  },
  confirm: {
    yes: '[Y] Yes',
    no: '[N] No',
    kill: (name: string) => `Delete instance "${name}" and its worktree?`,
    pause: (name: string) => `Pause "${name}"? Worktree will be removed but branch kept.`,
    push: (branch: string) => `Push branch "${branch}" to origin and open in browser?`,
    apply: (name: string, host: string) =>
      `Apply "${name}" — squash into ${host} as one commit and retire the instance?`,
  },
  merge: {
    headerCannot: 'Cannot merge',
    headerConflicts: 'Conflicts detected',
    headerReady: 'Ready to merge',
    headerReadyRetire: 'Ready to merge & retire',
    headerQueued: 'Ready to queue',
    headerQueuedRetire: 'Ready to queue & retire',
    fromLabel: 'from  ',
    intoLabel: 'into  ',
    unknownBranch: '(unknown)',
    detachedHead: '(detached HEAD)',
    conflictingFiles: 'Conflicting files:',
    moreFiles: (n: number) => `  … +${n} more`,
    dirtyWarn: '⚠ Worktree has uncommitted changes.',
    dirtyDetail: (branch: string) =>
      `  Confirming will auto-commit them to ${branch || 'the source branch'} first, then merge.`,
    retireWarn: '⚠ Instance will be killed after merge — tmux, worktree and branch all removed.',
    retireDetail: '  Use [n] / Esc here if you want to keep the agent running.',
    queueWarn: 'A merge is already running.',
    queueDetail: '  Confirming queues this merge; it will be rechecked before it runs.',
    confirmMerge: '[Y / ↵] Merge',
    confirmRetire: '[Y / ↵] Merge & retire',
    confirmQueue: '[Y / ↵] Queue merge',
    confirmQueueRetire: '[Y / ↵] Queue merge & retire',
    cancel: '[N / Esc] Cancel',
    checkoutOption: 'Checkout — pause this session and copy branch name',
    copyPrompt: (agent: string) => `Copy agent prompt (${agent})`,
    closeHint: 'Close',
    pressEsc: 'Press Esc to close.',
  },
  help: {
    subtitle: 'Manage multiple Claude Code / aider sessions in isolated git worktrees.',
    sections: {
      managing: 'Managing',
      handoff: 'Handoff',
      other: 'Other',
    },
    entries: {
      new: 'Create a new session',
      newWithPrompt: 'Create a new session with a prompt',
      kill: 'Kill (delete) the selected session',
      nav: 'Navigate between sessions',
      reorder: 'Reorder sessions down / up',
      attach: 'Attach to the selected session',
      detach: 'Detach from an attached session (or tmux prefix + d)',
      push: 'Commit and push branch to GitHub',
      checkout: 'Checkout: commit changes, pause session, copy branch to clipboard',
      resume: 'Resume a paused session',
      merge: 'Merge worktree branch into the host branch (agent keeps running)',
      mergeRetire: 'Merge & retire — merge, then kill tmux / worktree / branch',
      apply: 'Apply — squash the instance branch as one commit, then retire',
      pull: 'Pull from base branch — merge host changes down into the worktree',
      send: 'Send a prompt to the live session without attaching',
      switchTab: 'Switch between Preview and Diff tabs',
      scroll: 'Scroll preview / diff (Esc to exit scroll)',
      tmux: 'Open the tmux manager panel — list / kill our live tmux sessions',
      help: 'Show this help',
      quit: 'Quit the application',
    },
    pressAnyKey: 'Press any key to close.',
  },
  onboarding: {
    attachTitle: 'Attaching to session',
    attachBody: 'The session runs inside tmux. To return to claude-squad:',
    attachDetachHint: ' — or the native tmux prefix + d (default Ctrl+B d)',
    attachFooter: 'Press any key to attach.',
    startedTitle: 'Session created',
    branchLabel: 'branch: ',
    branchSuffix: ' (in an isolated git worktree)',
    programLabel: 'program: ',
    programSuffix: ' (running in background tmux)',
    startedAttach: 'attach',
    startedSwitchTab: 'switch tab',
    startedCheckout: 'checkout',
    startedPush: 'push',
    startedKill: 'kill',
    startedFooter: 'Press any key to continue.',
    checkoutTitle: 'Checkout session',
    checkoutLine1: 'Changes will be auto-committed locally and the worktree removed.',
    checkoutLine2: 'The branch is preserved and its name is copied to your clipboard,',
    checkoutLine3: 'so you can `git checkout` it from any other repo.',
    checkoutResumeHint: 'resumes the session later.',
    checkoutFooter: 'Press any key to confirm.',
  },
  toast: {
    instanceLimit: (max: number) => `instance limit reached (${max})`,
    pausedNeedResume: 'Instance is paused — press r to resume before opening.',
    noBranchYet: 'instance has no branch yet — cannot merge',
    instanceBusy: 'An operation is already in progress on this instance.',
    nothingToMerge: 'Branch is up to date with host — nothing to merge.',
    nothingToApply: 'Branch is up to date with host — nothing to apply.',
    cleanupFailed: (err: string) => `merge succeeded but cleanup failed: ${err}`,
    merged: (src: string, host: string, autoCommitted: boolean, retired: boolean) => {
      const auto = autoCommitted ? ' (with auto-commit of pending changes)' : '';
      const tail = retired
        ? ' Instance retired.'
        : ' Agent still running — d kill / c checkout when done.';
      return `Merged ${src} → ${host}${auto}.${tail}`;
    },
    mergeQueued: (src: string, position: number) =>
      `Queued merge of ${src}; ${position} merge${position === 1 ? '' : 's'} ahead.`,
    mergeBlocked: (src: string, reason: string) => `cannot merge ${src}: ${reason}`,
    mergeConflicts: (src: string, host: string, n: number) =>
      `cannot merge ${src} into ${host}: ${n} file${n === 1 ? '' : 's'} would conflict`,
    mergeFailed: (src: string, err: string) => `merge ${src} failed: ${err}`,
    clipboardCopyFailed: 'failed to copy prompt to clipboard',
    nameRequired: 'name required',
    nameExists: (name: string) => `instance "${name}" already exists`,
    promptRequired: 'prompt required',
    sendNotRunning: 'session is not running — resume it first',
    sendEmpty: 'nothing to send',
    sendFailed: (err: string) => `failed to send: ${err}`,
    pulledFromHost: (host: string) => `Pulled ${host} → worktree.`,
    pullBlocked: (reason: string) => `cannot pull: ${reason}`,
    pullConflicts: (host: string, n: number) =>
      `cannot pull ${host}: ${n} file${n === 1 ? '' : 's'} would conflict`,
    pullFailed: (err: string) => `pull failed: ${err}`,
    applied: (src: string, host: string, autoCommitted: boolean) => {
      const auto = autoCommitted ? ' (with auto-commit of pending changes)' : '';
      return `Applied ${src} → ${host} as one commit${auto}. Instance retired.`;
    },
    applyBlocked: (reason: string) => `cannot apply: ${reason}`,
    applyConflicts: (host: string, n: number) =>
      `cannot apply into ${host}: ${n} file${n === 1 ? '' : 's'} would conflict`,
    applyFailed: (err: string) => `apply failed: ${err}`,
    tmuxKilled: (name: string) => `killed ${name}`,
    tmuxKillFailed: (name: string) => `failed to kill ${name}`,
    tmuxKilledOrphans: (n: number) => `killed ${n} orphan${n === 1 ? '' : 's'}`,
  },
  blocker: {
    hostDetachedHead: 'host repo is in detached HEAD — checkout a branch first',
    hostDirty: 'host repo has uncommitted changes — commit or stash first',
    sourceBranchMissing: (branch: string) =>
      `branch "${branch}" not found in host repo (was the worktree pushed?)`,
    worktreeDetachedHead: 'worktree is in detached HEAD — cannot pull',
    worktreeDirty: 'worktree has uncommitted changes — let the agent settle first',
    worktreeOnHostBranch: (branch: string) =>
      `worktree is already on "${branch}" — nothing to pull`,
    hostBranchMissing: (branch: string) => `branch "${branch}" not found from worktree`,
    mergePrecheckFailed: (detail: string) => detail || 'merge precheck failed',
    pullPrecheckFailed: (detail: string) => detail || 'pull precheck failed',
    noBaseBranch: 'no base branch recorded for this instance',
  },
  menu: {
    new: 'new',
    kill: 'kill',
    open: 'open',
    submitPR: 'submit PR',
    checkout: 'checkout',
    merge: 'merge',
    apply: 'apply',
    pull: 'pull',
    switchTab: 'switch tab',
    quit: 'quit',
    help: 'help',
    resume: 'resume',
    start: 'start',
    submit: 'submit',
    cancel: 'cancel',
    sendPrompt: 'send',
    send: 'send',
    tmux: 'tmux',
  },
  tmuxPanel: {
    title: 'tmux sessions',
    empty: 'no live sessions',
    headerStatus: '',
    headerName: 'session',
    headerCmd: 'cmd',
    headerWindows: 'win',
    headerSize: 'size',
    headerAge: 'age',
    badgeTracked: 'tracked',
    badgeOrphan: 'orphan',
    badgeAttached: 'attached',
    badgeForeign: 'foreign',
    keysHint: '↑/↓ select · d kill · a kill orphans · r refresh · q close',
    confirmKill: (name: string) => `kill ${name}?`,
    confirmKillOrphans: (n: number) => `kill ${n} orphan${n === 1 ? '' : 's'}?`,
    confirmYesNo: 'y/n',
    summary: (live: number, orphan: number) =>
      orphan > 0 ? `${live} live · ${orphan} orphan` : `${live} live`,
  },
};

type Messages = typeof EN;

const ZH: Messages = {
  app: {
    logoSubtitle: '« TypeScript 版 »',
    logoStack: 'SolidJS · OpenTUI · Bun',
  },
  list: {
    instancesChip: ' 实例 ',
    autoYesChip: ' auto-yes ',
    noSessions: '还没有会话。',
    hintName: '创建新会话',
    hintPrompt: '带提示词创建',
    hintHelp: '完整帮助',
    willBeCreated: '(将会创建)',
    translatingName: '正在生成名称…',
    creatingInstance: '正在创建会话…',
  },
  tabs: {
    preview: '预览',
    diff: '差异',
    switchHint: 'tab / shift+tab 切换',
  },
  preview: {
    emptyCapture: '(空)',
    pressNToCreate: '按 n 创建新会话 —— N 带提示词创建',
    errorPrefix: (msg: string) => `错误: ${msg}`,
    errorRecover: '会话出错 —— 按 r 重启 tmux，d 删除实例',
    scrollFooter: (offset: number) => `-- 滚动模式 (偏移 ${offset}) — Esc 回到最新 --`,
  },
  diff: {
    selectToView: '选择一个实例查看 diff',
    noChanges: '暂无改动',
    scrollFooter: (offset: number) => `-- 滚动模式 (偏移 ${offset}) — Esc 回到顶部 --`,
  },
  paused: {
    title: '会话已暂停',
    headlinePreview: '工作树已切出，tmux 已冻结',
    headlineDiff: '工作树已移除，没有可比对的内容',
    branchLabel: '分支  ',
    branchPreserved: '  (已保留)',
    whatNow: '下一步',
    actions: {
      resumeTitle: '恢复',
      resumeDesc: '重建工作树并重新接入',
      submitTitle: '提交 PR',
      submitDesc: '把分支推到远端',
      mergeTitle: '合并',
      mergeDesc: '合入主分支',
      killTitle: '删除',
      killDesc: '彻底清理分支和工作树',
    },
  },
  placeholder: {
    newName: '命名新会话 (中文也可)…',
    prompt: '新会话的提示词 (中文也可)…',
  },
  sendPrompt: {
    header: '发送到',
    placeholder: '输入要发送的内容 —— Enter 发送，Shift+Enter 换行…',
    hint: '↵ 发送  ·  Shift+↵ 换行  ·  Esc 取消',
  },
  confirm: {
    yes: '[Y] 是',
    no: '[N] 否',
    kill: (name: string) => `删除实例 "${name}" 及其工作树？`,
    pause: (name: string) => `暂停 "${name}"？工作树将被移除但保留分支。`,
    push: (branch: string) => `推送分支 "${branch}" 到 origin 并在浏览器打开？`,
    apply: (name: string, host: string) =>
      `应用 "${name}" —— squash 成一个 commit 合入 ${host}，并关闭实例？`,
  },
  merge: {
    headerCannot: '无法合并',
    headerConflicts: '检测到冲突',
    headerReady: '可以合并',
    headerReadyRetire: '可以合并并关闭实例',
    headerQueued: '可以排队合并',
    headerQueuedRetire: '可以排队合并并关闭',
    fromLabel: '从    ',
    intoLabel: '合入  ',
    unknownBranch: '(未知)',
    detachedHead: '(游离 HEAD)',
    conflictingFiles: '冲突文件:',
    moreFiles: (n: number) => `  … 还有 ${n} 个`,
    dirtyWarn: '⚠ 工作树有未提交改动。',
    dirtyDetail: (branch: string) => `  确认后将先自动 commit 到 ${branch || '源分支'}，再合并。`,
    retireWarn: '⚠ 合并后实例会被一并关闭 —— tmux、工作树、分支全部清理。',
    retireDetail: '  想保留会话继续跑，按 [n] / Esc 取消。',
    queueWarn: '已有一个合并正在执行。',
    queueDetail: '  确认后会进入队列；真正执行前会重新校验。',
    confirmMerge: '[Y / ↵] 合并',
    confirmRetire: '[Y / ↵] 合并并关闭',
    confirmQueue: '[Y / ↵] 排队合并',
    confirmQueueRetire: '[Y / ↵] 排队合并并关闭',
    cancel: '[N / Esc] 取消',
    checkoutOption: '切出 —— 暂停会话并复制分支名',
    copyPrompt: (agent: string) => `复制 ${agent} 的提示词`,
    closeHint: '关闭',
    pressEsc: '按 Esc 关闭。',
  },
  help: {
    subtitle: '在隔离的 git worktree 中管理多个 Claude Code / aider 会话。',
    sections: {
      managing: '管理',
      handoff: '移交',
      other: '其他',
    },
    entries: {
      new: '创建新会话',
      newWithPrompt: '创建新会话（带提示词）',
      kill: '删除选中的会话',
      nav: '在会话间导航',
      reorder: '上移 / 下移会话',
      attach: '接入选中的会话',
      detach: '从已接入的会话退出（或 tmux prefix + d）',
      push: '提交并把分支推到 GitHub',
      checkout: '切出: 提交改动、暂停会话、复制分支名到剪贴板',
      resume: '恢复已暂停的会话',
      merge: '把工作树分支合入主分支（会话继续保留）',
      mergeRetire: '合并并关闭 —— 合并后清理 tmux / 工作树 / 分支',
      apply: '应用 —— 把分支 squash 成单个 commit，再关闭实例',
      pull: '从基准分支拉取 —— 把 host 的新提交合入工作树',
      send: '不接入会话、直接向运行中的会话发送一段提示词',
      switchTab: '在 Preview 和 Diff 之间切换',
      scroll: '滚动 preview / diff（Esc 退出滚动）',
      tmux: '打开 tmux 管理面板 —— 查看 / 删除我们启动的活跃 tmux 会话',
      help: '显示此帮助',
      quit: '退出程序',
    },
    pressAnyKey: '按任意键关闭。',
  },
  onboarding: {
    attachTitle: '正在接入会话',
    attachBody: '会话运行在 tmux 中。要返回 claude-squad:',
    attachDetachHint: ' —— 或者用原生 tmux prefix + d（默认 Ctrl+B d）',
    attachFooter: '按任意键接入。',
    startedTitle: '会话已创建',
    branchLabel: '分支: ',
    branchSuffix: '（在隔离的 git worktree 中）',
    programLabel: '程序: ',
    programSuffix: '（后台 tmux 中运行）',
    startedAttach: '接入',
    startedSwitchTab: '切换 tab',
    startedCheckout: '切出',
    startedPush: '推送',
    startedKill: '删除',
    startedFooter: '按任意键继续。',
    checkoutTitle: '切出会话',
    checkoutLine1: '改动会自动 commit 到本地，工作树将被移除。',
    checkoutLine2: '分支会保留，分支名复制到剪贴板，',
    checkoutLine3: '这样你可以在任意其他仓库里 `git checkout` 它。',
    checkoutResumeHint: '稍后恢复会话。',
    checkoutFooter: '按任意键确认。',
  },
  toast: {
    instanceLimit: (max: number) => `已达实例上限 (${max})`,
    pausedNeedResume: '实例已暂停 —— 请先按 r 恢复再打开',
    noBranchYet: '实例尚未创建分支 —— 无法合并',
    instanceBusy: '该实例正在执行操作，请稍候',
    nothingToMerge: '分支已与主分支同步 —— 没有需要合并的内容',
    nothingToApply: '分支已与主分支同步 —— 没有需要应用的内容',
    cleanupFailed: (err: string) => `合并成功但清理失败: ${err}`,
    merged: (src: string, host: string, autoCommitted: boolean, retired: boolean) => {
      const auto = autoCommitted ? '（含未提交改动自动 commit）' : '';
      const tail = retired ? ' 实例已关闭。' : ' 会话仍在运行 —— 完成后按 d 删除 / c 切出。';
      return `已合并 ${src} → ${host}${auto}。${tail}`;
    },
    mergeQueued: (src: string, position: number) =>
      `已将 ${src} 加入合并队列；前面还有 ${position} 个合并。`,
    mergeBlocked: (src: string, reason: string) => `无法合并 ${src}: ${reason}`,
    mergeConflicts: (src: string, host: string, n: number) =>
      `无法将 ${src} 合入 ${host}: ${n} 个文件会冲突`,
    mergeFailed: (src: string, err: string) => `合并 ${src} 失败: ${err}`,
    clipboardCopyFailed: '复制提示词到剪贴板失败',
    nameRequired: '请输入名称',
    nameExists: (name: string) => `实例 "${name}" 已存在`,
    promptRequired: '请输入提示词',
    sendNotRunning: '会话未运行 —— 请先 r 恢复',
    sendEmpty: '没有要发送的内容',
    sendFailed: (err: string) => `发送失败: ${err}`,
    pulledFromHost: (host: string) => `已拉取 ${host} → 工作树。`,
    pullBlocked: (reason: string) => `无法拉取: ${reason}`,
    pullConflicts: (host: string, n: number) => `无法拉取 ${host}: ${n} 个文件会冲突`,
    pullFailed: (err: string) => `拉取失败: ${err}`,
    applied: (src: string, host: string, autoCommitted: boolean) => {
      const auto = autoCommitted ? '（含未提交改动自动 commit）' : '';
      return `已应用 ${src} → ${host}（一个 commit）${auto}。实例已关闭。`;
    },
    applyBlocked: (reason: string) => `无法应用: ${reason}`,
    applyConflicts: (host: string, n: number) => `无法应用到 ${host}: ${n} 个文件会冲突`,
    applyFailed: (err: string) => `应用失败: ${err}`,
    tmuxKilled: (name: string) => `已 kill ${name}`,
    tmuxKillFailed: (name: string) => `kill ${name} 失败`,
    tmuxKilledOrphans: (n: number) => `已 kill ${n} 个 orphan`,
  },
  blocker: {
    hostDetachedHead: '主仓库处于游离 HEAD —— 请先 checkout 一个分支',
    hostDirty: '主仓库有未提交改动 —— 请先 commit 或 stash',
    sourceBranchMissing: (branch: string) =>
      `主仓库找不到分支 "${branch}"（worktree 是否已 push?）`,
    worktreeDetachedHead: '工作树处于游离 HEAD —— 无法拉取',
    worktreeDirty: '工作树有未提交改动 —— 请等 agent 收尾',
    worktreeOnHostBranch: (branch: string) => `工作树已经在 "${branch}" 上 —— 没什么可拉取`,
    hostBranchMissing: (branch: string) => `工作树看不到分支 "${branch}"`,
    mergePrecheckFailed: (detail: string) => detail || '合并预检失败',
    pullPrecheckFailed: (detail: string) => detail || '拉取预检失败',
    noBaseBranch: '该实例没有记录基准分支',
  },
  menu: {
    new: '新建',
    kill: '删除',
    open: '打开',
    submitPR: '提 PR',
    checkout: '切出',
    merge: '合并',
    apply: '应用',
    pull: '拉取',
    switchTab: '切 tab',
    quit: '退出',
    help: '帮助',
    resume: '恢复',
    start: '开始',
    submit: '提交',
    cancel: '取消',
    sendPrompt: '发送',
    send: '发送',
    tmux: 'tmux',
  },
  tmuxPanel: {
    title: 'tmux 会话',
    empty: '没有活跃会话',
    headerStatus: '',
    headerName: '会话',
    headerCmd: '命令',
    headerWindows: '窗口',
    headerSize: '尺寸',
    headerAge: '时长',
    badgeTracked: '已托管',
    badgeOrphan: '孤儿',
    badgeAttached: '已连接',
    badgeForeign: '他项目',
    keysHint: '↑/↓ 选择 · d 删除 · a 清孤儿 · r 刷新 · q 关闭',
    confirmKill: (name: string) => `删除 ${name}？`,
    confirmKillOrphans: (n: number) => `删除 ${n} 个 orphan？`,
    confirmYesNo: 'y/n',
    summary: (live: number, orphan: number) =>
      orphan > 0 ? `${live} 个活跃 · ${orphan} 个孤儿` : `${live} 个活跃`,
  },
};

const MESSAGES: Record<Lang, Messages> = { en: EN, zh: ZH };

let currentLang: Lang = 'en';

export function setLang(lang: Lang): void {
  currentLang = lang;
}

export function getLang(): Lang {
  return currentLang;
}

/** Read POSIX locale env vars; treat anything starting with `zh` as Chinese. */
export function detectSystemLang(): Lang {
  const env =
    process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || process.env.LANGUAGE || '';
  return env.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/** Resolve a `LangSetting` to a concrete `Lang`. `auto` (or anything we don't
 *  recognise) falls back to the system locale. */
export function resolveLang(setting: LangSetting | undefined): Lang {
  if (setting === 'zh' || setting === 'en') return setting;
  return detectSystemLang();
}

/**
 * Pull a value out of the active language's message tree. The callback form
 * keeps the call site refactorable (rename a key → all callers update) and
 * lets TypeScript flag typos / wrong shape at the call site.
 *
 * For parameterised entries the tree stores a function; `t(m => m.toast.merged)`
 * returns that function and callers invoke it with their values.
 */
export function t<R>(pick: (m: Messages) => R): R {
  return pick(MESSAGES[currentLang]);
}

/**
 * Render a precheck `MergeBlocker` as a localized human string. The git
 * layer keeps reasons as structured discriminants; presentation joins them
 * with the active language here.
 */
export function formatBlocker(b: MergeBlocker): string {
  switch (b.kind) {
    case 'hostDetachedHead':
      return t((m) => m.blocker.hostDetachedHead);
    case 'hostDirty':
      return t((m) => m.blocker.hostDirty);
    case 'sourceBranchMissing':
      return t((m) => m.blocker.sourceBranchMissing)(b.branch);
    case 'worktreeDetachedHead':
      return t((m) => m.blocker.worktreeDetachedHead);
    case 'worktreeDirty':
      return t((m) => m.blocker.worktreeDirty);
    case 'worktreeOnHostBranch':
      return t((m) => m.blocker.worktreeOnHostBranch)(b.branch);
    case 'hostBranchMissing':
      return t((m) => m.blocker.hostBranchMissing)(b.branch);
    case 'mergePrecheckFailed':
      return t((m) => m.blocker.mergePrecheckFailed)(b.detail);
    case 'pullPrecheckFailed':
      return t((m) => m.blocker.pullPrecheckFailed)(b.detail);
  }
}
