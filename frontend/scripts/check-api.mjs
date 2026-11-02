// Fails when the committed generated client differs from what docs/api/openapi.yaml would generate.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const committed = 'src/app/core/api/generated';
const tmp = mkdtempSync(join(tmpdir(), 'pilescan-api-'));
try {
  execFileSync('npx', ['ng-openapi-gen', '--config', 'ng-openapi-gen.json', '--output', tmp, '--silent', 'true'], {
    stdio: 'inherit',
  });
  try {
    execFileSync('diff', ['-r', committed, tmp], { stdio: 'inherit' });
    console.log('Generated API client is in sync with docs/api/openapi.yaml');
  } catch {
    console.error('\nGenerated API client is out of date. Run: npm run generate:api');
    process.exitCode = 1;
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
