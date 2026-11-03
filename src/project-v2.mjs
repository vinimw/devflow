import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export const DEVFLOW_STATUSES = Object.freeze([
  'Backlog', 'Ready', 'In progress', 'In review', 'Done',
]);

const STATUS_COLORS = ['GRAY', 'BLUE', 'YELLOW', 'ORANGE', 'GREEN'];
const STATUS_DESCRIPTIONS = [
  'Not yet approved for development',
  'Approved and available for development',
  'Implementation underway',
  'Pull request awaiting merge',
  'Merged and completed',
];

function validateRepo(value) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value ?? '') || value === 'owner/repository') {
    throw new Error('Set project.repository to a real owner/repository in .devflow.yaml');
  }
  return value;
}

function configValue(text, key) {
  const match = text.match(new RegExp('^[ \\t]*' + key + '[ \\t]*:[ \\t]*(.*)$', 'm'));
  if (!match) return null;
  const raw = match[1].replace(/[ \t]+#.*$/, '').trim();
  return raw.replace(/^["'](.*)["']$/, '$1');
}

export function readProjectSettings(cwd = process.cwd()) {
  const file = join(resolve(cwd), '.devflow.yaml');
  if (!existsSync(file)) throw new Error('Missing .devflow.yaml; run devflow init --apply first');
  const text = readFileSync(file, 'utf8');
  const repo = validateRepo(configValue(text, 'repository'));
  const title = configValue(text, 'name');
  if (!title || title === 'replace-me' || title.length > 100) {
    throw new Error('Set project.name to a valid project title in .devflow.yaml');
  }
  const rawNumber = configValue(text, 'github_project_number');
  if (rawNumber && rawNumber !== 'null' && !/^[1-9]\d*$/.test(rawNumber)) {
    throw new Error('github_project_number must be null or a positive integer');
  }
  return { file, text, repo, owner: repo.split('/')[0], title, number: rawNumber === 'null' ? null : (rawNumber ? Number(rawNumber) : null) };
}

export function persistProjectNumber(settings, number, write = writeFileSync) {
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid GitHub Project number');
  if (settings.number !== null && settings.number !== number) {
    throw new Error('Refusing to replace an existing GitHub Project number');
  }
  const next = settings.text.replace(/^([ \t]*github_project_number[ \t]*:[ \t]*)(null|[0-9]+)([ \t]*(?:#.*)?)$/m, (_match, prefix, _old, suffix) => prefix + String(number) + suffix);
  if (next === settings.text && settings.number !== number) {
    throw new Error('Cannot safely update github_project_number in .devflow.yaml');
  }
  if (next !== settings.text) write(settings.file, next, { encoding: 'utf8', flag: 'w' });
}

export function systemGh(args, options = {}) {
  const response = spawnSync('gh', args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    input: options.input,
    timeout: 45_000,
    maxBuffer: 6 * 1024 * 1024,
    env: process.env,
  });
  if (response.error) throw new Error('GitHub CLI failed: ' + response.error.message);
  if (response.status !== 0) {
    const message = (response.stderr || response.stdout || 'unknown error').trim().slice(0, 900);
    throw new Error('gh ' + args.slice(0, 3).join(' ') + ' failed: ' + message);
  }
  const output = (response.stdout ?? '').trim();
  if (!options.json) return output;
  try { return JSON.parse(output); }
  catch { throw new Error('GitHub CLI returned invalid JSON for gh ' + args.slice(0, 3).join(' ')); }
}

function exec(gh, args, options = {}) {
  return gh(args, options);
}

function array(value, key) {
  if (!Array.isArray(value?.[key])) {
    throw new Error('Unexpected GitHub CLI response: missing ' + key + ' collection');
  }
  return value[key];
}

function exactStatuses(field) {
  if (!field || !Array.isArray(field.options)) return false;
  return DEVFLOW_STATUSES.every((name, index) => field.options[index]?.name === name) &&
    field.options.length === DEVFLOW_STATUSES.length;
}

function listFields(gh, owner, number) {
  const payload = exec(gh, ['project', 'field-list', String(number), '--owner', owner, '--format', 'json', '--limit', '100'], { json: true });
  return array(payload, 'fields');
}

function findStatus(fields) {
  return fields.find((field) => field.name === 'Status') ?? null;
}

function projectView(gh, owner, number) {
  const project = exec(gh, ['project', 'view', String(number), '--owner', owner, '--format', 'json'], { json: true });
  if (Number(project.number) !== number) throw new Error('GitHub returned a different Project number');
  return project;
}

function locateProject(gh, settings) {
  if (settings.number !== null) {
    return { project: projectView(gh, settings.owner, settings.number), origin: 'configured' };
  }
  const payload = exec(gh, ['project', 'list', '--owner', settings.owner, '--limit', '100', '--format', 'json'], { json: true });
  const projects = array(payload, 'projects');
  if (projects.length >= 100) throw new Error('Owner has 100+ projects; specify github_project_number explicitly');
  const matches = projects.filter((project) => project.title === settings.title);
  if (matches.length > 1) throw new Error('Multiple projects have this title; specify github_project_number explicitly');
  return matches.length ? { project: matches[0], origin: 'matching-title' } : { project: null, origin: 'missing' };
}

function setStatusOptions(gh, field) {
  if (!field?.id) throw new Error('Cannot configure Status: GitHub did not return a field ID');
  const query = 'mutation($input: UpdateProjectV2FieldInput!) { updateProjectV2Field(input: $input) { projectV2Field { ... on ProjectV2SingleSelectField { id name options { id name } } } } }';
  const singleSelectOptions = DEVFLOW_STATUSES.map((name, index) => ({
    name,
    color: STATUS_COLORS[index],
    description: STATUS_DESCRIPTIONS[index],
  }));
  exec(gh, ['api', 'graphql', '--input', '-'], {
    input: JSON.stringify({ query, variables: { input: { fieldId: field.id, singleSelectOptions } } }),
    json: true,
  });
}

function show(result, output) { if (output) output(result); return result; }

/**
 * Safe by default: dry-run discovers a matching board but does not create or edit.
 * Only a newly created, empty board gets its default Status choices replaced.
 * Existing boards with different choices are never rewritten automatically.
 */
export function setupProject({ cwd = process.cwd(), apply = false } = {}, gh = systemGh, output = console.log) {
  const settings = readProjectSettings(cwd);
  const found = locateProject(gh, settings);
  const plan = {
    repository: settings.repo,
    owner: settings.owner,
    title: settings.title,
    projectNumber: found.project ? Number(found.project.number) : null,
    action: found.project ? 'reuse-project' : 'create-project',
    apply,
  };
  if (!apply) {
    if (found.project) {
      const status = findStatus(listFields(gh, settings.owner, plan.projectNumber));
      plan.status = exactStatuses(status) ? 'ready' : 'needs-configuration';
      plan.existingStatusOptions = status?.options?.map((option) => option.name) ?? [];
    } else plan.status = 'will-configure-new-project';
    return show(plan, output);
  }

  const project = found.project ?? exec(gh, [
    'project', 'create', '--owner', settings.owner, '--title', settings.title, '--format', 'json',
  ], { json: true });

  const number = Number(project.number);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Could not determine the Project number');
  plan.projectNumber = number;
  plan.action = found.project ? 'reused-project' : 'created-project';
  persistProjectNumber(settings, number);

  let fields = listFields(gh, settings.owner, number);
  let status = findStatus(fields);
  if (!status && !found.project) {
    exec(gh, [
      'project', 'field-create', String(number), '--owner', settings.owner,
      '--name', 'Status', '--data-type', 'SINGLE_SELECT',
      '--single-select-options', DEVFLOW_STATUSES.join(','),
      '--format', 'json',
    ], { json: true });
    fields = listFields(gh, settings.owner, number);
    status = findStatus(fields);
  }

  if (!exactStatuses(status)) {
    if (found.project) {
      throw new Error('Existing Project Status options differ from DevFlow. Refusing to rewrite an existing board. Adjust them manually and retry.');
    }
    // New, empty project only. The default GitHub Status field may use Todo/In Progress/Done.
    setStatusOptions(gh, status);
    status = findStatus(listFields(gh, settings.owner, number));
    if (!exactStatuses(status)) throw new Error('Could not verify the five DevFlow Status options');
  }
  plan.status = 'ready';

  if (!found.project) {
    // Repository linking is convenient but not essential to the board's lifecycle.
    try {
      exec(gh, ['project', 'link', String(number), '--owner', settings.owner, '--repo', settings.repo]);
      plan.repositoryLink = 'linked';
    } catch (error) {
      plan.repositoryLink = 'needs-manual-link';
      plan.linkWarning = String(error.message);
    }
  }
  return show(plan, output);
}

/**
 * Add one existing repository issue to the configured Project. Preserve the
 * status of existing items; only a newly attached/blank item gets Backlog.
 */
export function syncIssue({ cwd = process.cwd(), issue, apply = false } = {}, gh = systemGh, output = console.log) {
  const settings = readProjectSettings(cwd);
  if (!settings.number) throw new Error('Configure github_project_number first with devflow github project setup --apply');
  if (!/^[1-9]\d*$/.test(String(issue ?? ''))) throw new Error('--issue must be a positive issue number');
  const number = Number(issue);
  const data = exec(gh, [
    'issue', 'view', String(number), '--repo', settings.repo, '--json', 'number,url,state',
  ], { json: true });
  if (Number(data.number) !== number || data.url !== 'https://github.com/' + settings.repo + '/issues/' + String(number)) {
    throw new Error('GitHub returned an issue outside the configured repository');
  }
  if (data.state !== 'OPEN') throw new Error('Closed issues cannot be newly synchronized');

  const project = projectView(gh, settings.owner, settings.number);
  if (!project.id) throw new Error('Project V2 GraphQL ID is unavailable');
  const fields = listFields(gh, settings.owner, settings.number);
  const statusField = findStatus(fields);
  if (!exactStatuses(statusField)) throw new Error('The Project Status field does not match the DevFlow workflow');

  const payload = exec(gh, [
    'project', 'item-list', String(settings.number), '--owner', settings.owner,
    '--format', 'json', '--limit', '1000',
  ], { json: true });
  const items = array(payload, 'items');
  const matches = items.filter((item) => item.content?.url === data.url);
  if (matches.length > 1) throw new Error('Duplicate items found for this issue; resolve manually');
  if (!matches.length && items.length >= 1000) throw new Error('Project has 1000+ items; cannot safely establish issue absence');
  const existing = matches[0] ?? null;
  const action = existing ? (existing.status ? 'preserve-existing-status' : 'set-blank-status-to-backlog') : 'add-to-backlog';
  const result = { repository: settings.repo, issue: number, projectNumber: settings.number, action, status: existing?.status ?? null, apply };
  if (!apply) return show(result, output);
  let item = existing;
  if (!item) {
    item = exec(gh, ['project', 'item-add', String(settings.number), '--owner', settings.owner, '--url', data.url, '--format', 'json'], { json: true });
  }
  if (!existing?.status) {
    const backlog = statusField.options.find((option) => option.name === 'Backlog');
    if (!item?.id || !statusField.id || !backlog?.id) throw new Error('Missing GitHub Project item, field or option ID');
    exec(gh, [
      'project', 'item-edit', '--id', item.id, '--project-id', project.id,
      '--field-id', statusField.id, '--single-select-option-id', backlog.id,
    ]);
    result.status = 'Backlog';
  }
  return show(result, output);
}

export function projectMain(argv, gh = systemGh, output = console.log) {
  const [kind, ...parts] = argv;
  const opts = {};
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part.startsWith('--')) throw new Error('Unexpected argument: ' + part);
    const [name, embedded] = part.slice(2).split('=', 2);
    if (!['cwd', 'issue', 'apply'].includes(name)) throw new Error('Unknown option --' + name);
    if (name === 'apply') opts.apply = true;
    else {
      const value = embedded ?? parts[++i];
      if (!value || value.startsWith('--')) throw new Error('Missing value for --' + name);
      opts[name] = value;
    }
  }
  if (kind === 'plan') return setupProject({ ...opts, apply: false }, gh, output);
  if (kind === 'setup') {
    if (!opts.apply) throw new Error('Project setup requires --apply; run github project plan first');
    return setupProject(opts, gh, output);
  }
  if (kind === 'sync') {
    if (!opts.issue) throw new Error('github sync requires --issue N');
    return syncIssue(opts, gh, output);
  }
  throw new Error('Usage: github project plan|setup --apply OR github sync --issue N [--apply]');
}
