import { findRepoRoot, isGitRepo } from '../../session/git/util.js';
import { generateProjectID, listProjects } from '../../session/project.js';
import { loadConfig } from '../../shared/config.js';
import {
  appDir,
  configPath,
  daemonPidPath,
  globalStatePath,
  logFilePath,
  projectDir,
  projectStatePath,
  projectsRoot,
  projectWorktreesRoot,
  statePath,
  worktreesRoot,
} from '../../shared/paths.js';

export async function runDebug(): Promise<void> {
  const cfg = await loadConfig();
  const cwd = process.cwd();
  // Best-effort: only report a "current project" block when cwd is in a
  // git repo. Outside one, just dump the global paths.
  let current: Record<string, string> | undefined;
  if (await isGitRepo(cwd)) {
    const repoPath = await findRepoRoot(cwd);
    const id = generateProjectID(repoPath);
    current = {
      repoPath,
      projectID: id,
      projectDir: projectDir(id),
      projectStatePath: projectStatePath(id),
      projectWorktreesRoot: projectWorktreesRoot(id),
    };
  }
  const out = {
    paths: {
      appDir: appDir(),
      configPath: configPath(),
      globalStatePath: globalStatePath(),
      projectsRoot: projectsRoot(),
      legacyStatePath: statePath(),
      legacyWorktreesRoot: worktreesRoot(),
      daemonPidPath: daemonPidPath(),
      logFilePath: logFilePath(),
    },
    currentProject: current,
    projects: await listProjects(),
    config: cfg,
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}
