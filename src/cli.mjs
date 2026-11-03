import { shortcutMain } from './shortcuts.mjs';
import { agentMain } from './agent.mjs';
import { taskMain } from './tasks.mjs';
import { projectMain } from './project-v2.mjs';
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATUS = ['Backlog', 'Ready', 'In progress', 'In review', 'Done'];
const DEFAULT_AREAS = ['web', 'api', 'shared', 'infra', 'docs'];
const DEFAULT_TYPES = ['feature', 'bug', 'refactor', 'documentation', 'chore', 'infrastructure'];
const PRIORITY_COLORS = { P0: 'b60205', P1: 'd93f0b', P2: 'fbca04', P3: 'c2e0c6' };

export function parseArgs(argv) {
  const [command = 'help', subcommand, ...tail] = argv;
  const argumentsList = (command === 'github' ? tail : [subcommand, ...tail]).filter(Boolean);
  const opts = {};
  for (let i = 0; i < argumentsList.length; i += 1) {
    const arg = argumentsList[i];
    if (!arg.startsWith('--')) throw new Error('Unexpected argument: ' + arg);
    const [key, embedded] = arg.slice(2).split('=', 2);
    if (!['cwd', 'name', 'repo', 'project-number', 'ui-locale', 'apply', 'force', 'json'].includes(key)) throw new Error('Unknown option --' + key);
    if (['apply', 'force', 'json'].includes(key)) {
      opts[key] = true;
    } else {
      const val = embedded ?? argumentsList[++i];
      if (!val || val.startsWith('--')) throw new Error('Missing value for --' + key);
      opts[key] = val;
    }
  }
  return { command, subcommand: command === 'github' ? subcommand : null, opts };
}

function templates(path) { return join(packageRoot, 'templates', path); }
function exists(path) { return existsSync(path); }
function log(message) { process.stdout.write(message + '\n'); }
function run(program, args, cwd) {
  const response = spawnSync(program, args, { cwd, encoding: 'utf8', timeout: 20000, env: process.env });
  if (response.error) return { ok: false, detail: response.error.message };
  return { ok: response.status === 0, detail: (response.stdout || response.stderr || '').trim(), status: response.status };
}
function validRepo(value) { return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value); }
function valueOrPlaceholder(name) { return name ?? 'replace-me'; }
function templateConfig(options) {
  const text = readFileSync(templates('project/devflow.yaml'), 'utf8');
  const replacement = {
    'name: replace-me': 'name: ' + valueOrPlaceholder(options.name),
    'repository: owner/repository': 'repository: ' + valueOrPlaceholder(options.repo ?? 'owner/repository'),
    'github_project_number: null': 'github_project_number: ' + (options['project-number'] ?? 'null'),
    'ui_locale: pt-BR': 'ui_locale: ' + (options['ui-locale'] ?? 'pt-BR'),
  };
  return Object.entries(replacement).reduce((body, [from, to]) => body.replace(from, to), text);
}
export function init(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  if (!exists(cwd)) throw new Error('Target directory not found: ' + cwd);
  const repo = options.repo;
  if (repo && !validRepo(repo)) throw new Error('--repo must be owner/repository');
  if (options['project-number'] && !/^[1-9]\d*$/.test(options['project-number'])) throw new Error('--project-number must be a positive integer');
  const files = [
    { target: '.devflow.yaml', content: templateConfig(options) },
    { target: 'AGENTS.md', source: templates('AGENTS.md') },
    { target: 'CLAUDE.md', source: templates('CLAUDE.md') },
    { target: '.github/ISSUE_TEMPLATE/devflow-task.md', source: templates('github/issue-template.md') },
  ];
  const changes = files.map((item) => ({ ...item, path: join(cwd, item.target), action: exists(join(cwd, item.target)) ? (options.force ? 'overwrite' : 'skip') : 'create' }));
  if (!options.apply) {
    log('DRY RUN: devflow init — no files written');
    changes.forEach((item) => log(item.action + ' ' + item.target));
    log('Pass --apply to write files; existing files remain untouched unless --force is also passed.');
    return changes;
  }
  for (const item of changes) {
    if (item.action === 'skip') { log('skip ' + item.target + ' (already exists)'); continue; }
    mkdirSync(dirname(item.path), { recursive: true });
    if (item.source) copyFileSync(item.source, item.path);
    else writeFileSync(item.path, item.content, { encoding: 'utf8', flag: options.force ? 'w' : 'wx' });
    log(item.action + ' ' + item.target);
  }
  log('Next: inspect .devflow.yaml, then run devflow doctor or devflow github plan.');
  return changes;
}
function readConfig(cwd) {
  const path = join(cwd, '.devflow.yaml');
  if (!exists(path)) return null;
  const content = readFileSync(path, 'utf8');
  const repo = content.match(/^\s*repository:\s*([^#\n]+)/m)?.[1].trim();
  const number = content.match(/^\s*github_project_number:\s*([^#\n]+)/m)?.[1].trim();
  const branch = content.match(/^\s*default_branch:\s*([^#\n]+)/m)?.[1].trim() ?? 'main';
  return { repo, projectNumber: number && number !== 'null' ? number : null, branch };
}
export function doctor(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const config = readConfig(cwd);
  const checks = [
    { name: 'devflow-config', ok: !!config, detail: config ? 'found .devflow.yaml' : 'missing .devflow.yaml; run devflow init --apply' },
    { name: 'git', ...run('git', ['rev-parse', '--is-inside-work-tree'], cwd) },
    { name: 'gh', ...run('gh', ['--version'], cwd) },
    { name: 'github-auth', ...run('gh', ['auth', 'status'], cwd) },
  ];
  if (config) {
    checks.push({ name: 'repository', ok: validRepo(config.repo ?? '') && config.repo !== 'owner/repository', detail: config.repo ?? 'not configured' });
    if (config.repo && validRepo(config.repo) && config.repo !== 'owner/repository') {
      const result = run('gh', ['repo', 'view', config.repo, '--json', 'nameWithOwner,defaultBranchRef'], cwd);
      checks.push({ name: 'github-repository', ...result });
    }
    if (config.projectNumber && /^\d+$/.test(config.projectNumber) && config.repo && validRepo(config.repo)) {
      const owner = config.repo.split('/')[0];
      checks.push({ name: 'github-project', ...run('gh', ['project', 'view', config.projectNumber, '--owner', owner, '--format', 'json'], cwd) });
    } else {
      checks.push({ name: 'github-project', ok: false, detail: 'Project number unset; initialize or configure the Project' });
    }
  }
  if (options.json) log(JSON.stringify({ checks, ok: checks.every((check) => check.ok) }, null, 2));
  else checks.forEach((check) => log((check.ok ? 'OK' : 'WARN') + ' ' + check.name + ': ' + (check.detail ?? '')));
  return { checks, ok: checks.every((check) => check.ok) };
}
function labels() {
  const priorities = Object.entries(PRIORITY_COLORS).map(([name, color]) => ({ name: 'priority:' + name, color, description: 'Priority ' + name }));
  const areas = DEFAULT_AREAS.map((area) => ({ name: 'project:' + area, color: '1d76db', description: 'Project area ' + area }));
  const types = DEFAULT_TYPES.map((type) => ({ name: 'type:' + type, color: 'a2eeef', description: 'Task type ' + type }));
  return [...priorities, ...areas, ...types];
}
export function githubPlan(options = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const config = readConfig(cwd);
  if (!config || !validRepo(config.repo ?? '') || config.repo === 'owner/repository') throw new Error('Configure a valid project.repository in .devflow.yaml before GitHub setup');
  const plan = { repo: config.repo, projectNumber: config.projectNumber, desiredStatuses: STATUS, labels: labels(), mode: options.apply ? 'apply-labels' : 'dry-run' };
  if (!options.apply) {
    log('DRY RUN: GitHub setup for ' + config.repo);
    log('Required labels: ' + plan.labels.map((label) => label.name).join(', '));
    log('Expected Project V2 statuses: ' + STATUS.join(' → '));
    log('Use devflow github project plan/setup to configure GitHub Projects V2 separately.');
    return plan;
  }
  const auth = run('gh', ['auth', 'status'], cwd);
  if (!auth.ok) throw new Error('GitHub CLI authentication unavailable; run gh auth login and grant repo/project permissions');
  const repoCheck = run('gh', ['repo', 'view', config.repo, '--json', 'nameWithOwner'], cwd);
  if (!repoCheck.ok) throw new Error('Cannot access configured GitHub repository: ' + repoCheck.detail);
  const existing = run('gh', ['api', 'repos/' + config.repo + '/labels', '-X', 'GET', '-f', 'per_page=100', '--jq', '.[].name'], cwd);
  if (!existing.ok) throw new Error('Unable to list labels: ' + existing.detail);
  const found = new Set(existing.detail.split('\n').filter(Boolean));
  for (const label of plan.labels) {
    if (found.has(label.name)) { log('skip ' + label.name); continue; }
    const res = run('gh', ['api', 'repos/' + config.repo + '/labels', '-X', 'POST', '-f', 'name=' + label.name, '-f', 'color=' + label.color, '-f', 'description=' + label.description], cwd);
    if (!res.ok) throw new Error('Unable to create label ' + label.name + ': ' + res.detail);
    log('created ' + label.name);
  }
  if (config.projectNumber) {
    const p = run('gh', ['project', 'view', config.projectNumber, '--owner', config.repo.split('/')[0], '--format', 'json'], cwd);
    log(p.ok ? 'Project exists; verify its Status field options manually.' : 'WARN: cannot inspect configured Project V2: ' + p.detail);
  } else log('WARN: configure github_project_number using devflow github project plan/setup.');
  return plan;
}
function help() {
  log('DevFlow v0.7 — reusable AI project workflow');
  log('  devflow config [--cwd DIR] [--repo OWNER/REPO] [--project-number N] [--apply]');
  log('  devflow project [--cwd DIR] [--apply]');
  log('  devflow next [--cwd DIR] [--apply]');
  log('  devflow init [--cwd DIR] [--name NAME] [--repo OWNER/REPO] [--project-number N] [--ui-locale pt-BR] [--apply] [--force]');
  log('  devflow doctor [--cwd DIR] [--json]');
  log('  devflow github plan [--cwd DIR]');
  log('  devflow github setup [--cwd DIR] --apply     # create missing labels only');
  log('  devflow github project plan [--cwd DIR]');
  log('  devflow github project setup [--cwd DIR] --apply');
  log('  devflow github sync --issue N [--cwd DIR] [--apply]');
  log('Project V2 setup and issue sync require explicit --apply; existing statuses are preserved.');
  log('  devflow task create --title TITLE --body-file FILE --priority P2 --area web --type feature [--apply]');
  log('  devflow task next [--apply]');
  log('  devflow task branch --issue N [--apply]');
  log('  devflow task pr --issue N [--apply]   # draft PR, never pushes');
  log('  devflow task review --issue N --pr P [--apply]');
  log('  devflow task complete --issue N --pr P [--apply]');
  log('  devflow agent preflight [--provider codex|claude]');
  log('  devflow agent install [--cwd DIR] [--provider codex|claude|both] [--apply]');
  log('  devflow agent handoff --issue N [--provider codex|claude] [--apply]');
  log('Agent commands prepare files only. They never invoke AI, use credits, or run unattended.');
}
export async function main(argv) {
  if (['config','project','next'].includes(argv[0])) return shortcutMain(argv);
  if (argv[0] === 'agent') return agentMain(argv.slice(1));
  if (argv[0] === 'task') return taskMain(argv.slice(1));
  if (argv[0] === 'github' && (argv[1] === 'project' || argv[1] === 'sync')) {
    return projectMain(argv[1] === 'project' ? argv.slice(2) : ['sync', ...argv.slice(2)]);
  }
  const { command, subcommand, opts } = parseArgs(argv);
  if (command === 'init') return init(opts);
  if (command === 'doctor') return doctor(opts);
  if (command === 'github' && subcommand === 'plan') return githubPlan({ ...opts, apply: false });
  if (command === 'github' && subcommand === 'setup') {
    if (!opts.apply) throw new Error('github setup requires --apply. Use github plan first.');
    return githubPlan(opts);
  }
  if (command === 'help' || command === '--help' || command === '-h') return help();
  throw new Error('Unknown command; run devflow help');
}
