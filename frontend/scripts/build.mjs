/**
 * `npm run build`: ng build with a build stamp (commit + time) compiled in as PILESCAN_BUILD,
 * so the console and the debug overlay always say which version is running.
 * The commit comes from git, or from BUILD_COMMIT in the Docker build (no .git there).
 */
import { execFileSync, spawnSync } from 'node:child_process';

function commit() {
  if (process.env.BUILD_COMMIT) return process.env.BUILD_COMMIT;
  try {
    return execFileSync('git', ['describe', '--always', '--dirty', '--abbrev=7'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const stamp = `${commit()} ${new Date().toISOString().slice(0, 16)}Z`;
const result = spawnSync('npx', ['ng', 'build', '--define', `PILESCAN_BUILD=${JSON.stringify(stamp)}`, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
