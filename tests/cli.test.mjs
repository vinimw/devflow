import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { init, parseArgs, githubPlan } from '../src/cli.mjs';

function withTemp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'devflow-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('init defaults to dry-run and does not write files', (t) => {
  const cwd = withTemp(t);
  const result = init({ cwd, name: 'Garden', repo: 'owner/garden' });
  assert.equal(result.length, 4);
  assert.equal(existsSync(join(cwd, '.devflow.yaml')), false);
  assert.equal(existsSync(join(cwd, 'AGENTS.md')), false);
});

test('init writes config, agent instructions and issue template only with --apply', (t) => {
  const cwd = withTemp(t);
  init({ cwd, name: 'Garden', repo: 'owner/garden', 'project-number': '3', apply: true });
  const config = readFileSync(join(cwd, '.devflow.yaml'), 'utf8');
  assert.match(config, /name: Garden/);
  assert.match(config, /repository: owner\/garden/);
  assert.match(config, /github_project_number: 3/);
  assert.equal(existsSync(join(cwd, '.github/ISSUE_TEMPLATE/devflow-task.md')), true);
});

test('init preserves existing instructions without force', (t) => {
  const cwd = withTemp(t);
  writeFileSync(join(cwd, 'AGENTS.md'), 'personal project rules\n');
  init({ cwd, repo: 'owner/garden', apply: true });
  assert.equal(readFileSync(join(cwd, 'AGENTS.md'), 'utf8'), 'personal project rules\n');
});

test('init overwrites only with explicit --force and --apply', (t) => {
  const cwd = withTemp(t);
  writeFileSync(join(cwd, 'AGENTS.md'), 'old contents\n');
  init({ cwd, repo: 'owner/garden', force: true });
  assert.equal(readFileSync(join(cwd, 'AGENTS.md'), 'utf8'), 'old contents\n');
  init({ cwd, repo: 'owner/garden', force: true, apply: true });
  assert.match(readFileSync(join(cwd, 'AGENTS.md'), 'utf8'), /DevFlow/);
});

test('rejects invalid GitHub repository names', (t) => {
  const cwd = withTemp(t);
  assert.throws(() => init({ cwd, repo: 'not-a-repository', apply: true }), /owner\/repository/);
  assert.equal(existsSync(join(cwd, '.devflow.yaml')), false);
});

test('github plan is read only and requires configured repo', (t) => {
  const cwd = withTemp(t);
  assert.throws(() => githubPlan({ cwd }), /Configure a valid/);
  init({ cwd, repo: 'owner/garden', apply: true });
  const plan = githubPlan({ cwd });
  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.labels.length, 15);
  assert.deepEqual(plan.desiredStatuses, ['Backlog', 'Ready', 'In progress', 'In review', 'Done']);
});

test('parseArgs supports explicit --apply and validates unknown arguments', () => {
  assert.deepEqual(parseArgs(['github', 'setup', '--apply']).opts, { apply: true });
  assert.deepEqual(parseArgs(['init', '--repo', 'owner/project']).opts, { repo: 'owner/project' });
  assert.throws(() => parseArgs(['init', '--unexpected']), /Unknown option/);
});
