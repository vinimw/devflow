#!/usr/bin/env node
/**
 * Zero-network, zero-AI smoke test for the documented first-run workflow.
 * Only touches a disposable directory beneath the system temporary directory.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync, mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const executable = join(repoRoot, 'bin', 'devflow.mjs');
const sandbox = mkdtempSync(join(tmpdir(), 'devflow-smoke-'));
const target = join(sandbox, 'example-project');
mkdirSync(target, { recursive: true });

const environment = {
  ...process.env,
  OPENAI_API_KEY: '',
  ANTHROPIC_API_KEY: '',
  CODEX_API_KEY: '',
  CLAUDE_API_KEY: '',
};

function invoke(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [executable, ...args], {
    cwd: target,
    env: environment,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    expectedStatus,
    'Expected exit ' + expectedStatus + ' for ' + args.join(' ') +
      '\nstdout:\n' + result.stdout + '\nstderr:\n' + result.stderr,
  );
  return result.stdout + result.stderr;
}

try {
  console.log('1/7 Checking CLI help (offline)');
  const help = invoke(['help']);
  assert.match(help, /DevFlow v0\.6/);
  assert.match(help, /agent install/);

  console.log('2/7 Previewing new project scaffolding (no writes)');
  const preview = invoke([
    'init', '--cwd', target, '--name', 'ExampleApp',
    '--repo', 'example/example-app',
  ]);
  assert.match(preview, /DRY RUN/);
  assert.equal(existsSync(join(target, '.devflow.yaml')), false);

  console.log('3/7 Applying templates without GitHub access');
  invoke([
    'init', '--cwd', target, '--name', 'ExampleApp',
    '--repo', 'example/example-app', '--apply',
  ]);
  assert.match(readFileSync(join(target, '.devflow.yaml'), 'utf8'), /repository: example\/example-app/);

  console.log('4/7 Verifying existing instructions are preserved');
  writeFileSync(join(target, 'AGENTS.md'), '# Project-specific instructions\n', 'utf8');
  const repeat = invoke([
    'init', '--cwd', target, '--name', 'ExampleApp',
    '--repo', 'example/example-app', '--apply',
  ]);
  assert.match(repeat, /skip AGENTS\.md/);
  assert.equal(readFileSync(join(target, 'AGENTS.md'), 'utf8'), '# Project-specific instructions\n');

  console.log('5/7 Installing the skill for both supported agents');
  invoke(['agent', 'install', '--cwd', target]);
  assert.equal(existsSync(join(target, '.agents/skills/devflow/SKILL.md')), false);
  invoke(['agent', 'install', '--cwd', target, '--apply']);
  for (const location of ['.agents', '.claude']) {
    assert.ok(existsSync(join(target, location, 'skills/devflow/SKILL.md')));
    assert.ok(existsSync(join(target, location, 'skills/devflow/references/subscription-safety.md')));
  }
  const repeatInstall = invoke(['agent', 'install', '--cwd', target, '--apply']);
  assert.match(repeatInstall, /unchanged/);

  console.log('6/7 Validating subscription boundary without calling providers');
  const preflight = invoke(['agent', 'preflight', '--provider', 'codex']);
  assert.match(preflight, /includedOnlyUsageAttestable: false/);
  assert.match(preflight, /unattendedSafe: false/);
  assert.match(preflight, /invokesProvider: false/);

  console.log('7/7 Rejecting unsupported provider without external activity');
  const invalid = invoke(['agent', 'install', '--cwd', target, '--provider', 'paid-api'], 1);
  assert.match(invalid, /Unsupported agent provider/);

  console.log('PASS: first-run workflow is reproducible without GitHub writes or AI usage.');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
