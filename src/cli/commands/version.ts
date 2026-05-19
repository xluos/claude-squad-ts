import { APP_NAME, APP_VERSION } from '../../shared/constants.js';

export function runVersion(): void {
  process.stdout.write(`${APP_NAME} v${APP_VERSION}\n`);
}
