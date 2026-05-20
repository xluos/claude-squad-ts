// Color palette mirroring the original lipgloss styles, adapted for Ink.
// Ink accepts named colors (red/green/...), hex (#abc / #aabbcc), and chalk RGB triplets.

export const colors = {
  // Charm 经典紫 #7D56F4 降饱和+降明度一档：在 Logo / List 选中条 / Tab / 边框
  // 这种大色块用法下不再扎眼。色相基本保留（251°），饱和 87→39，明度 65→52。
  primary: '#6755B5',
  accent: '#FFA500',
  success: '#22C55E',
  danger: '#EF4444',
  warning: '#F59E0B',
  muted: '#6B7280',
  border: '#374151',
  borderActive: '#6755B5',

  statusRunning: '#22C55E',
  statusReady: '#3B82F6',
  statusLoading: '#F59E0B',
  statusPaused: '#9CA3AF',

  diffAdded: '#16A34A',
  diffRemoved: '#DC2626',

  // Light blue-grey, matches the Go reference's `selectedTitleStyle.Background`
  // (`#dde4f0`). Pairs with `selectedFg` for readable dark text.
  selectedBg: '#dde4f0',
  selectedFg: '#1a1a1a',
  // Solid fill for modal overlay bodies — opaque so the panel masks
  // whatever sits underneath it, while the surrounding screen stays
  // visible (no full-screen backdrop). Catppuccin-Mocha-ish dark slate:
  // clearly "floating panel" against a #000 terminal bg without the
  // pure-black look of an off-screen well.
  overlayBg: '#1e1e2e',
  selectedBranch: '#444444',
  tabActive: '#FFFFFF',
  tabInactive: '#9CA3AF',
} as const;

export const icons = {
  running: '●',
  ready: '○',
  loading: '◐',
  paused: '⏸',
  selected: '▶',
} as const;
