import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readProjectSettings, systemGh, DEVFLOW_STATUSES, syncIssue } from './project-v2.mjs';

const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
const AREAS = ['web', 'api', 'shared', 'infra', 'docs'];
const TYPES = ['feature', 'bug', 'refactor', 'documentation', 'chore', 'infrastructure'];
const REQUIRED_SECTIONS = [
  'Summary', 'Context', 'Objective', 'Scope', 'Technical Requirements',
  'Expected Files / Modules', 'Implementation Guidelines', 'Dependencies',
  'Acceptance Criteria', 'Validation', 'Out of Scope', 'AI Agent Notes',
];
const HEADINGS = REQUIRED_SECTIONS.map((s) => s.toLowerCase());
const PREFIX = { feature: 'feat', bug: 'fix', refactor: 'refactor', documentation: 'docs', chore: 'chore', infrastructure: 'chore' };

export function parseTaskArgs(argv) {
  const [action, ...args] = argv;
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) throw new Error('Unexpected argument: ' + arg);
    const [name, embedded] = arg.slice(2).split('=', 2);
    if (!['cwd','issue','pr','title','body-file','priority','area','type','apply'].includes(name)) throw new Error('Unknown option --' + name);
    if (name === 'apply') { opts.apply = true; continue; }
    const value = embedded ?? args[++i];
    if (!value || value.startsWith('--')) throw new Error('Missing value for --' + name);
    opts[name] = value;
  }
  return { action, opts };
}

function ghCall(gh, args, cwd, json = true) {
  return gh(args, { cwd, json });
}
function collection(data, name) {
  if (!Array.isArray(data?.[name])) throw new Error('Missing GitHub ' + name + ' array');
  return data[name];
}
function labels(issue) {
  if (!Array.isArray(issue.labels)) throw new Error('Issue labels are unavailable');
  return issue.labels.map((label) => typeof label === 'string' ? label : label.name);
}
function oneLabel(issue, prefix, values) {
  const matches = labels(issue).filter((label) => label.startsWith(prefix));
  if (matches.length !== 1 || !values.includes(matches[0].slice(prefix.length))) return null;
  return matches[0].slice(prefix.length);
}
function issueNumber(item, repo) {
  const url = item.content?.url ?? '';
  const prefix = 'https://github.com/' + repo + '/issues/';
  return url.startsWith(prefix) && /^[1-9]\d*$/.test(url.slice(prefix.length))
    ? Number(url.slice(prefix.length)) : null;
}
function formatStatusField(gh, settings) {
  if (!settings.number) throw new Error('Set github_project_number before running task commands');
  const project = ghCall(gh, ['project','view',String(settings.number),'--owner',settings.owner,'--format','json'], undefined);
  if (!project?.id || Number(project.number) !== settings.number) throw new Error('Configured Project identity could not be verified');
  const fields = collection(ghCall(gh, ['project','field-list',String(settings.number),'--owner',settings.owner,'--format','json','--limit','100']), 'fields');
  const field = fields.find((f) => f.name === 'Status');
  if (!field?.id || !Array.isArray(field.options) || DEVFLOW_STATUSES.some((name) => !field.options.some((o) => o.name === name))) {
    throw new Error('Project Status must contain all five DevFlow options');
  }
  return { project, field };
}
function board(gh, settings) {
  const items = collection(ghCall(gh, ['project','item-list',String(settings.number),'--owner',settings.owner,'--format','json','--limit','1000']), 'items');
  if (items.length >= 1000) throw new Error('Project has 1,000+ items; cannot safely inspect the complete board');
  return items;
}
function issueView(gh, settings, number) {
  const data = ghCall(gh, ['issue','view',String(number),'--repo',settings.repo,'--json','number,url,title,body,labels,state,createdAt']);
  if (data?.number !== number || data.url !== 'https://github.com/' + settings.repo + '/issues/' + number) throw new Error('Unexpected issue identity');
  return data;
}
function sections(body) {
  const map = new Map();
  const pattern = /^#{2,3}\s+(.+?)\s*$/gm;
  const positions = [...String(body ?? '').matchAll(pattern)];
  positions.forEach((match, index) => {
    const name = match[1].trim().toLowerCase();
    map.set(name, body.slice(match.index + match[0].length, positions[index+1]?.index ?? body.length).trim());
  });
  return map;
}
export function validateTaskBody(body) {
  const result = sections(body);
  const missing = HEADINGS.filter((key) => !result.get(key));
  if (missing.length) throw new Error('Task body is missing required populated sections: ' + missing.join(', '));
  if (!/- \[[ xX]\]/.test(result.get('acceptance criteria'))) throw new Error('Acceptance Criteria must contain at least one checkbox');
  return result;
}
export function dependencies(body) {
  const section = sections(body).get('dependencies')?.trim() ?? '';
  if (!section || /^(none|n\/a|no dependencies|nenhuma|sem dependências)[.\s]*$/i.test(section)) return [];
  const links = [...section.matchAll(/(?:^|[^\w])#([1-9]\d*)\b/g)].map((match) => Number(match[1]));
  if (!links.length) throw new Error('Dependencies must be "None" or contain issue references such as #123');
  return [...new Set(links)];
}
function taskDetails(issue) {
  const priority = oneLabel(issue,'priority:',PRIORITIES);
  const area = oneLabel(issue,'project:',AREAS);
  const type = oneLabel(issue,'type:',TYPES);
  if (!priority || !area || !type) return null;
  try { validateTaskBody(issue.body); }
  catch { return null; }
  return { priority, area, type };
}
export function pickReady({ items, issues, repo, selectedArea } = {}) {
  const busyAreas = new Set();
  const allActive = items.filter((item) => item.status === 'In progress' || item.status === 'In review');
  for (const item of allActive) {
    const num = issueNumber(item, repo);
    if (num !== null && issues.has(num)) {
      const area = oneLabel(issues.get(num), 'project:', AREAS);
      if (area) busyAreas.add(area);
    }
  }
  // One task globally, including work awaiting PR review/merge.
  if (allActive.length) return { issue: null, reason: 'Another task is in progress or in review' };
  const candidates = [];
  for (const item of items) {
    if (item.status !== 'Ready') continue;
    const number = issueNumber(item, repo);
    if (!number) continue;
    const issue = issues.get(number);
    if (!issue || issue.state !== 'OPEN') continue;
    const detail = taskDetails(issue);
    if (!detail || busyAreas.has(detail.area) || (selectedArea && selectedArea !== detail.area)) continue;
    const deps = dependencies(issue.body);
    const satisfied = deps.every((dep) => {
      const reference = issues.get(dep);
      const done = items.some((x) => issueNumber(x,repo) === dep && x.status === 'Done');
      return reference?.state === 'CLOSED' && done;
    });
    if (!satisfied) continue;
    candidates.push({ number, title: issue.title, area: detail.area, type: detail.type, priority: detail.priority, createdAt: issue.createdAt, itemId: item.id, url: issue.url });
  }
  candidates.sort((a,b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) || Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.number - b.number);
  return { issue: candidates[0] ?? null, reason: candidates.length ? null : 'No eligible Ready task' };
}
function collectIssues(gh, settings, items) {
  const result = new Map();
  for (const item of items) {
    const number = issueNumber(item, settings.repo);
    if (!number || result.has(number)) continue;
    result.set(number, issueView(gh,settings,number));
  }
  return result;
}
function changeStatus(gh, settings, itemId, status) {
  const { project, field } = formatStatusField(gh, settings);
  const option = field.options.find((o) => o.name === status);
  if (!itemId || !option?.id) throw new Error('Cannot identify project item or Status option');
  return ghCall(gh,['project','item-edit','--id',itemId,'--project-id',project.id,'--field-id',field.id,'--single-select-option-id',option.id],undefined,false);
}
export function nextTask({ cwd = process.cwd(), apply = false, issue, area } = {}, gh = systemGh, output = console.log) {
  const settings = readProjectSettings(cwd);
  const items = board(gh,settings);
  const issues = collectIssues(gh,settings,items);
  const picked = pickReady({items,issues,repo:settings.repo,selectedArea:area});
  if (issue && picked.issue?.number !== Number(issue)) throw new Error('Issue is not the highest-priority eligible Ready task');
  const result = { ...picked, apply };
  if (apply) {
    if (!picked.issue) throw new Error(picked.reason);
    // Re-read and re-check immediately before changing the board; no atomic lock exists.
    const fresh = board(gh, settings);
    const updated = pickReady({items:fresh,issues:collectIssues(gh,settings,fresh),repo:settings.repo,selectedArea:area});
    if (updated.issue?.number !== picked.issue.number) throw new Error('Task eligibility changed; retry selection');
    changeStatus(gh,settings,updated.issue.itemId,'In progress');
    result.status = 'In progress';
  }
  output(result);
  return result;
}
export function createTask({cwd=process.cwd(),title,bodyFile,priority='P2',area='web',type='feature',apply=false} = {}, gh=systemGh, output=console.log, sync=null) {
  const settings = readProjectSettings(cwd);
  if (!title?.trim() || title.trim().length > 160) throw new Error('Provide a title of at most 160 characters');
  if (!PRIORITIES.includes(priority) || !AREAS.includes(area) || !TYPES.includes(type)) throw new Error('Invalid task labels');
  if (!bodyFile || !existsSync(resolve(cwd,bodyFile))) throw new Error('Provide an existing --body-file');
  const body = readFileSync(resolve(cwd,bodyFile),'utf8');
  validateTaskBody(body);
  const listed = ghCall(gh,['issue','list','--repo',settings.repo,'--state','all','--limit','1000','--json','number,title']);
  if (!Array.isArray(listed)) throw new Error('Unexpected issue listing from GitHub');
  if (listed.length >= 1000) throw new Error('1,000+ issues; duplicate scan incomplete');
  if (listed.some((item) => item.title.trim().toLowerCase() === title.trim().toLowerCase())) throw new Error('An issue with this title already exists');
  const result = {repo:settings.repo,title,priority,area,type,apply,action:'create-issue-in-backlog'};
  if (apply) {
    const url = ghCall(gh,['issue','create','--repo',settings.repo,'--title',title.trim(),'--body-file',resolve(cwd,bodyFile),
      '--label','priority:'+priority,'--label','project:'+area,'--label','type:'+type],cwd,false);
    const match = String(url).match(new RegExp('^https://github\\.com/'+settings.repo.replace('/','\\/')+'/issues/([1-9]\\d*)$'));
    if (!match) throw new Error('Issue was created but URL could not be parsed; inspect GitHub before retrying');
    result.number = Number(match[1]);
    result.url = url;
    try {
      (sync ?? syncIssue)({cwd,issue:result.number,apply:true},gh,()=>{});
      result.boardSync = 'Backlog';
    } catch (error) {
      result.boardSync = 'failed: ' + error.message;
      result.recovery = 'Issue already created; run devflow github sync --issue '+result.number+' --apply';
    }
  }
  output(result);
  return result;
}
export function branchName(issue) {
  const meta = taskDetails(issue);
  if (!meta) throw new Error('Issue requires one valid priority, area and type label plus complete specification');
  const slug = issue.title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/^[a-z]+\([^)]*\):\s*/, '').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48).replace(/-$/,'');
  if (!slug) throw new Error('Cannot derive a safe branch name');
  return PREFIX[meta.type]+'/'+issue.number+'-'+slug;
}
export function prepareBranch({cwd=process.cwd(),issue,apply=false}={},gh=systemGh,git=systemGit,output=console.log) {
  const settings=readProjectSettings(cwd);
  const num=positive(issue,'--issue');
  const data=issueView(gh,settings,num);
  const items=board(gh,settings);
  const item=items.find((x)=>issueNumber(x,settings.repo)===num);
  if (!item || item.status!=='In progress') throw new Error('Task must be In progress to create its branch');
  const branch=branchName(data);
  const worktree=git(['status','--porcelain'],cwd);
  if (worktree.trim()) throw new Error('Working tree is dirty; refusing to alter branches');
  const actual=git(['remote','get-url','origin'],cwd);
  if (!new RegExp('(?:github\\.com[:/])'+settings.repo.replace('/','\\/')+'(?:\\.git)?\\s*$').test(actual)) throw new Error('Local origin does not match configured repository');
  const main=ghCall(gh,['repo','view',settings.repo,'--json','defaultBranchRef'],cwd);
  const defaultBranch=main.defaultBranchRef?.name;
  if (!defaultBranch || !/^[a-zA-Z0-9._/-]+$/.test(defaultBranch)) throw new Error('Could not verify the default branch');
  const result={branch,base:defaultBranch,apply};
  if (apply) {
    git(['fetch','origin',defaultBranch],cwd);
    git(['switch','-c',branch,'--no-track','origin/'+defaultBranch],cwd);
    result.created=true;
  }
  output(result);return result;
}
export function systemGit(args,cwd) {
  const r=spawnSync('git',args,{cwd:resolve(cwd),encoding:'utf8',timeout:45000,maxBuffer:1024*1024});
  if (r.error || r.status!==0) throw new Error('Git command failed: '+args.slice(0,2).join(' ')+' '+(r.stderr??r.error?.message??'').slice(0,500));
  return r.stdout.trim();
}
function positive(value,name) {
  if (!/^[1-9]\d*$/.test(String(value??''))) throw new Error(name+' must be a positive integer');
  return Number(value);
}
export function openTaskPr({cwd=process.cwd(),issue,apply=false}={},gh=systemGh,git=systemGit,output=console.log) {
  const settings=readProjectSettings(cwd);
  const number=positive(issue,'--issue');
  const data=issueView(gh,settings,number);
  const name=branchName(data);
  const current=git(['branch','--show-current'],cwd);
  if (current!==name) throw new Error('Check out the expected issue branch first: '+name);
  if (git(['status','--porcelain'],cwd)) throw new Error('Working tree has uncommitted changes');
  const ahead=git(['rev-list','--count','origin/'+name+'..HEAD'],cwd);
  if (ahead!=='0') throw new Error('Push validated commits to origin first; this command never pushes');
  const boardItems=board(gh,settings);
  if (boardItems.find(x=>issueNumber(x,settings.repo)===number)?.status!=='In progress') throw new Error('Task must be In progress');
  const prs=ghCall(gh,['pr','list','--repo',settings.repo,'--state','open','--json','number,headRefName,baseRefName,url'],cwd);
  if (!Array.isArray(prs)) throw new Error('PR list is unavailable');
  if (prs.some(p=>p.headRefName===name)) throw new Error('PR already exists for this branch; reuse it');
  const target=ghCall(gh,['repo','view',settings.repo,'--json','defaultBranchRef'],cwd).defaultBranchRef?.name;
  if (!target) throw new Error('Cannot verify PR base');
  const result={branch:name,base:target,issue:number,apply,action:'create-ready-pr'};
  if (apply) {
    result.url=ghCall(gh,['pr','create','--repo',settings.repo,'--base',target,'--head',name,
      '--title',data.title,'--body','Closes #'+number+'\n\nValidation and human review are required before merge.'],cwd,false);
  }
  output(result);return result;
}
export function reviewTask({cwd=process.cwd(),issue,pr,apply=false}={},gh=systemGh,output=console.log) {
  const settings=readProjectSettings(cwd),number=positive(issue,'--issue'),prNumber=positive(pr,'--pr');
  const data=issueView(gh,settings,number);
  const statusItems=board(gh,settings);
  const item=statusItems.find(x=>issueNumber(x,settings.repo)===number);
  if (item?.status!=='In progress') throw new Error('Issue must be In progress before entering review');
  const ref=ghCall(gh,['pr','view',String(prNumber),'--repo',settings.repo,'--json','number,state,isDraft,baseRefName,headRefName,body'],cwd);
  const target=ghCall(gh,['repo','view',settings.repo,'--json','defaultBranchRef'],cwd).defaultBranchRef?.name;
  if (ref.number!==prNumber || ref.state!=='OPEN' || ref.isDraft===true || ref.baseRefName!==target || ref.headRefName!==branchName(data) ||
      !new RegExp('(?:Closes|Fixes|Resolves)\\s+#'+number+'\\b','i').test(ref.body??'')) throw new Error('PR does not match expected issue, branch, base or closing reference');
  const result={issue:number,pr:prNumber,apply,status:'In review'};
  if(apply)changeStatus(gh,settings,item.id,'In review');
  output(result);return result;
}
export function completeTask({cwd=process.cwd(),issue,pr,apply=false}={},gh=systemGh,output=console.log) {
  const settings=readProjectSettings(cwd),number=positive(issue,'--issue'),prNumber=positive(pr,'--pr');
  const data=issueView(gh,settings,number);
  const items=board(gh,settings);
  const item=items.find(x=>issueNumber(x,settings.repo)===number);
  if(!item || !['In review','Done'].includes(item.status)) throw new Error('Issue must be In review or Done');
  const p=ghCall(gh,['pr','view',String(prNumber),'--repo',settings.repo,'--json','number,state,mergedAt,baseRefName,headRefName,body'],cwd);
  const target=ghCall(gh,['repo','view',settings.repo,'--json','defaultBranchRef'],cwd).defaultBranchRef?.name;
  if(p.number!==prNumber || !p.mergedAt || p.baseRefName!==target || p.headRefName!==branchName(data) ||
    !new RegExp('(?:Closes|Fixes|Resolves)\\s+#'+number+'\\b','i').test(p.body??''))throw new Error('Verified merged PR for task not found');
  const result={issue:number,pr:prNumber,apply,status:'Done'};
  if(apply){
    if(item.status!=='Done')changeStatus(gh,settings,item.id,'Done');
    if(data.state==='OPEN')ghCall(gh,['issue','close',String(number),'--repo',settings.repo],cwd,false);
  }
  output(result);return result;
}
export function taskMain(argv,gh=systemGh,git=systemGit,output=console.log) {
  const {action,opts}=parseTaskArgs(argv);
  if(action==='next')return nextTask({cwd:opts.cwd,apply:opts.apply,issue:opts.issue},gh,output);
  if(action==='create')return createTask({
    cwd:opts.cwd,title:opts.title,bodyFile:opts['body-file'],priority:opts.priority,area:opts.area,type:opts.type,apply:opts.apply,
  },gh,output);
  if(action==='branch')return prepareBranch({cwd:opts.cwd,issue:opts.issue,apply:opts.apply},gh,git,output);
  if(action==='pr')return openTaskPr({cwd:opts.cwd,issue:opts.issue,apply:opts.apply},gh,git,output);
  if(action==='review')return reviewTask({cwd:opts.cwd,issue:opts.issue,pr:opts.pr,apply:opts.apply},gh,output);
  if(action==='complete')return completeTask({cwd:opts.cwd,issue:opts.issue,pr:opts.pr,apply:opts.apply},gh,output);
  throw new Error('Usage: devflow task create|next|branch|pr|review|complete [--apply] (use --issue and --pr where required)');
}
