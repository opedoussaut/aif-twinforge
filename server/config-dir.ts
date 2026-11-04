import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Where the agent and its connectors find their settings and private files: `.env`, the reviewed
 * lab contract and the run journal under `.private/`, the 3D scenes. Several entry points share
 * one folder, so the widget's agent and a Claude Desktop connector see the same live runs.
 *
 * 1. The repository's own `.env` is read first (development settings).
 * 2. Then the config folder: `AIF_CONFIG_DIR` if set, else `~/.aif-twinforge` when it holds a
 *    `.env`, else the repository. Relative paths (`.private/...`) resolve there.
 *
 * Values already set are never overwritten, so the first source to set a variable wins.
 * Returns the config folder, which is also the new working folder.
 */
export function useConfigDir() {
  const repo = fileURLToPath(new URL('..', import.meta.url));
  process.chdir(repo);
  if (existsSync('.env')) process.loadEnvFile('.env');
  const home = join(homedir(), '.aif-twinforge');
  const dir = resolve(
    process.env.AIF_CONFIG_DIR?.trim() || (existsSync(join(home, '.env')) ? home : repo),
  );
  if (dir !== resolve(repo)) {
    if (!existsSync(dir)) throw new Error(`AIF_CONFIG_DIR ${dir} does not exist.`);
    process.chdir(dir);
    if (existsSync('.env')) process.loadEnvFile('.env');
  }
  return dir;
}
