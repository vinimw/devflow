import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupProject, syncIssue, projectMain, readProjectSettings, DEVFLOW_STATUSES } from '../src/project-v2.mjs';

function workspace(t, number = 'null') {
  const cwd = mkdtempSync(join(tmpdir(), 'devflow-project-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(join(cwd, '.devflow.yaml'),
    'project:\n  name: Example Project\n  repository: example/myapp\n  github_project_number: ' + number + '\n');
  return cwd;
}
function mock(options = {}) {
  const calls = [];
  let project = options.project === undefined ? { id: 'PVT_1', number: 4, title: 'Example Project' } : options.project;
  let field = options.field === undefined
    ? { name: 'Status', id: 'PVTSSF_1', options: DEVFLOW_STATUSES.map((name, i) => ({ name, id: 'OPTION_' + i })) }
    : options.field;
  const items = options.items ?? [];
  const gh = (args, extra = {}) => {
    calls.push({ args, input: extra.input });
    const key = args.slice(0, 2).join(' ');
    if (key === 'project list') return { projects: project ? [project] : [] };
    if (key === 'project create') { project = { id: 'PVT_1', number: 4, title: 'Example Project' }; return project; }
    if (key === 'project view') return project;
    if (key === 'project field-list') return { fields: field ? [field] : [] };
    if (key === 'project field-create') {
      field = { name: 'Status', id: 'PVTSSF_1', options: DEVFLOW_STATUSES.map((name, i) => ({ name, id: 'OPTION_' + i })) };
      return field;
    }
    if (key === 'api graphql') {
      const payload = JSON.parse(extra.input);
      assert.deepEqual(payload.variables.input.singleSelectOptions.map(x => x.name), DEVFLOW_STATUSES);
      field = { ...field, options: DEVFLOW_STATUSES.map((name, i) => ({ name, id: 'OPTION_' + i })) };
      return { data: { updateProjectV2Field: { projectV2Field: field } } };
    }
    if (key === 'project link') return '';
    if (key === 'issue view') return { number: 9, url: 'https://github.com/example/myapp/issues/9', state: 'OPEN' };
    if (key === 'project item-list') return { items };
    if (key === 'project item-add') return { id: 'PVTI_9' };
    if (key === 'project item-edit') return '';
    throw new Error('Unexpected gh invocation: ' + args.join(' '));
  };
  return { gh, calls };
}
const quiet = () => {};

test('project plan discovers an existing board without mutation', t => {
  const cwd = workspace(t);
  const fixture = mock();
  const result = setupProject({ cwd }, fixture.gh, quiet);
  assert.equal(result.action, 'reuse-project');
  assert.equal(result.status, 'ready');
  assert.equal(fixture.calls.some(call => call.args.includes('create')), false);
  assert.match(readFileSync(join(cwd, '.devflow.yaml'), 'utf8'), /github_project_number: null/);
});

test('project setup reuses existing board and persists its number', t => {
  const cwd = workspace(t);
  const fixture = mock();
  const result = setupProject({ cwd, apply: true }, fixture.gh, quiet);
  assert.equal(result.action, 'reused-project');
  assert.equal(result.projectNumber, 4);
  assert.match(readFileSync(join(cwd, '.devflow.yaml'), 'utf8'), /github_project_number: 4/);
  assert.equal(fixture.calls.some(call => call.args[1] === 'create'), false);
});

test('existing board with nonmatching statuses fails closed', t => {
  const cwd = workspace(t, '4');
  const fixture = mock({ field: { id: 'PVTSSF_1', name: 'Status', options: [{ name: 'Todo', id: 'x' }] } });
  assert.throws(() => setupProject({ cwd, apply: true }, fixture.gh, quiet), /Refusing to rewrite an existing board/);
  assert.equal(fixture.calls.some(call => call.args[0] === 'api'), false);
});

test('new project setup customizes Status and records number', t => {
  const cwd = workspace(t);
  const fixture = mock({ project: null, field: { id: 'PVTSSF_1', name: 'Status', options: [{ name: 'Todo' }] } });
  const result = setupProject({ cwd, apply: true }, fixture.gh, quiet);
  assert.equal(result.action, 'created-project');
  assert.equal(result.status, 'ready');
  assert.ok(fixture.calls.some(call => call.args[0] === 'api' && call.args[1] === 'graphql'));
  assert.match(readFileSync(join(cwd, '.devflow.yaml'), 'utf8'), /github_project_number: 4/);
});

test('sync dry run does not add issue or mutate its status', t => {
  const cwd = workspace(t, '4');
  const fixture = mock();
  const result = syncIssue({ cwd, issue: 9 }, fixture.gh, quiet);
  assert.equal(result.action, 'add-to-backlog');
  assert.equal(result.apply, false);
  assert.equal(fixture.calls.some(call => call.args[1] === 'item-add'), false);
});

test('sync adds issue to Backlog using project field IDs', t => {
  const cwd = workspace(t, '4');
  const fixture = mock();
  const result = syncIssue({ cwd, issue: 9, apply: true }, fixture.gh, quiet);
  assert.equal(result.status, 'Backlog');
  const edit = fixture.calls.find(call => call.args[1] === 'item-edit')?.args;
  assert.deepEqual(edit, ['project', 'item-edit', '--id', 'PVTI_9', '--project-id', 'PVT_1',
    '--field-id', 'PVTSSF_1', '--single-select-option-id', 'OPTION_0']);
});

test('sync existing in review issue preserves its status', t => {
  const cwd = workspace(t, '4');
  const fixture = mock({ items: [{ id: 'PVTI_9', status: 'In review', content: { url: 'https://github.com/example/myapp/issues/9' } }] });
  const result = syncIssue({ cwd, issue: 9, apply: true }, fixture.gh, quiet);
  assert.equal(result.action, 'preserve-existing-status');
  assert.equal(result.status, 'In review');
  assert.equal(fixture.calls.some(call => ['item-add','item-edit'].includes(call.args[1])), false);
});

test('sync existing blank status sets only Backlog without adding item', t => {
  const cwd = workspace(t, '4');
  const fixture = mock({ items: [{ id: 'PVTI_9', content: { url: 'https://github.com/example/myapp/issues/9' } }] });
  const result = syncIssue({ cwd, issue: 9, apply: true }, fixture.gh, quiet);
  assert.equal(result.status, 'Backlog');
  assert.equal(fixture.calls.some(call => call.args[1] === 'item-add'), false);
  assert.equal(fixture.calls.some(call => call.args[1] === 'item-edit'), true);
});

test('project command parsing requires --apply for setup', t => {
  const cwd = workspace(t);
  const fixture = mock();
  assert.throws(() => projectMain(['setup', '--cwd', cwd], fixture.gh, quiet), /requires --apply/);
  assert.equal(projectMain(['plan', '--cwd', cwd], fixture.gh, quiet).apply, false);
});

test('cannot sync an issue without a configured Project number', t => {
  const cwd = workspace(t);
  assert.throws(() => syncIssue({ cwd, issue: 9 }, mock().gh, quiet), /Configure github_project_number/);
});

test('rejects unexpected repository identity', t => {
  const cwd = workspace(t, '4');
  const gh = (args, opts) => {
    if (args[1] === 'view' && args[0] === 'issue') return { number: 9, url: 'https://github.com/another/repo/issues/9', state: 'OPEN' };
    return mock().gh(args, opts);
  };
  assert.throws(() => syncIssue({ cwd, issue: 9 }, gh, quiet), /outside the configured repository/);
});

test('parses project settings and required statuses', t => {
  const cwd = workspace(t, '5');
  assert.equal(readProjectSettings(cwd).number, 5);
  assert.deepEqual(DEVFLOW_STATUSES, ['Backlog', 'Ready', 'In progress', 'In review', 'Done']);
});
