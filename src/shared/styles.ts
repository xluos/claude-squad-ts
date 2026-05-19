// Color palette mirroring the original lipgloss styles, adapted for Ink.
// Ink accepts named colors (red/green/...), hex (#abc / #aabbcc), and chalk RGB triplets.

export const colors = {
  primary: '#7D56F4',
  accent: '#FFA500',
  success: '#22C55E',
  danger: '#EF4444',
  warning: '#F59E0B',
  muted: '#6B7280',
  border: '#374151',
  borderActive: '#7D56F4',

  statusRunning: '#22C55E',
  statusReady: '#3B82F6',
  statusLoading: '#F59E0B',
  statusPaused: '#9CA3AF',

  diffAdded: '#16A34A',
  diffRemoved: '#DC2626',

  selectedBg: '#1E293B',
  tabActive: '#FFFFFF',
  tabInactive: '#6B7280',
} as const;

export const icons = {
  running: '●',
  ready: '○',
  loading: '◐',
  paused: '⏸',
  selected: '▶',
} as const;
