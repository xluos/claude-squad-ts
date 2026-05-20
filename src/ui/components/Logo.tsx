import { For } from 'solid-js';
import { t } from '../../shared/i18n.js';
import { colors } from '../../shared/styles.js';

/** ASCII logo, lifted verbatim from the Go reference's `ui/consts.go`
 *  (`FallBackText`). Two stacked words: "CLAUDE" / "SQUAD". */
const LOGO_LINES = [
  '░█████╗░██╗░░░░░░█████╗░██╗░░░██╗██████╗░███████╗',
  '██╔══██╗██║░░░░░██╔══██╗██║░░░██║██╔══██╗██╔════╝',
  '██║░░╚═╝██║░░░░░███████║██║░░░██║██║░░██║█████╗░░',
  '██║░░██╗██║░░░░░██╔══██║██║░░░██║██║░░██║██╔══╝░░',
  '╚█████╔╝███████╗██║░░██║╚██████╔╝██████╔╝███████╗',
  '░╚════╝░╚══════╝╚═╝░░╚═╝░╚═════╝░╚═════╝░╚══════╝',
  '',
  '░██████╗░██████╗░██╗░░░██╗░█████╗░██████╗░',
  '██╔════╝██╔═══██╗██║░░░██║██╔══██╗██╔══██╗',
  '╚█████╗░██║██╗██║██║░░░██║███████║██║░░██║',
  '░╚═══██╗╚██████╔╝██║░░░██║██╔══██║██║░░██║',
  '██████╔╝░╚═██╔═╝░╚██████╔╝██║░░██║██████╔╝',
] as const;

/** Pixel width of the widest logo row (use the longer "CLAUDE" line). */
export const LOGO_COLS = LOGO_LINES[0].length;
/** Total number of rows the logo occupies. */
export const LOGO_ROWS = LOGO_LINES.length;

export interface LogoProps {
  /** Optional caption rendered under the logo, e.g. "Select an instance to preview". */
  caption?: string;
  /** Container width — used to centre horizontally when known. */
  width?: number;
  /** Container height — used to centre vertically when known. */
  height?: number;
}

/**
 * Centred fallback splash for the Preview pane when no instance is
 * selected (or when an instance is in an error state). Mirrors the Go
 * version's `setFallbackState` which renders the same ASCII block plus
 * a contextual message under it.
 */
export function Logo(props: LogoProps) {
  return (
    <box
      flexGrow={1}
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      width={props.width}
      height={props.height}
    >
      <For each={LOGO_LINES}>
        {(line) => (
          <text fg={colors.primary} wrapMode="none">
            {line || ' '}
          </text>
        )}
      </For>
      {/* TypeScript-port subtitle so this clearly reads as the TS rewrite
       *  and not the Go original. */}
      <text> </text>
      <box flexDirection="row">
        <text fg={colors.accent} attributes={1}>
          {t((m) => m.app.logoSubtitle)}
        </text>
      </box>
      <box flexDirection="row">
        <text fg={colors.muted}>{t((m) => m.app.logoStack)}</text>
      </box>
      {props.caption ? (
        <>
          <text> </text>
          <text fg={colors.muted}>{props.caption}</text>
        </>
      ) : null}
    </box>
  );
}
