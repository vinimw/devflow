import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readProjectSettings, setupProject, systemGh, DEVFLOW_STATUSES } from './project-v2.mjs';
import { nextTask, prepareBranch, systemGit } from './tasks.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectTemplate = join(root, 'templates', 'project', 'devflow.yaml');
const colors = ['GRAY','BLUE','YELLOW','ORANGE','GREEN'];
const descriptions = [
  'Not yet approved for development',
  'Approved and available for development',
  'Implementation underway',
  'Pull request awaiting merge',
  'Merged and completed',
];
const aliases = new Map([
  ['Todo', 'Backlog'], ['To do', 'Backlog'], ['To Do', 'Backlog'],
  ['In Progress', 'In progress'],
]);
const repoPattern = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

function positive(value, label) {
  if (!/^[1-9][0-9]*$/.test(String(value ?? ''))) throw new Error(label + ' must be a positive integer');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(label + ' exceeds the safe integer range');
  return parsed;
}
function validRepo(value) {
  return repoPattern.test(value ?? '') && value !== 'owner/repository';
}
function validateProjectName(name) {
  if (!name || name === 'replace-me' || name.length > 100 || /[\r\n]/.test(name)) {
    throw new Error('Project name must contain 1–100 characters');
  }
  return name;
}
function inspectConfig(cwd) {
  const path = join(resolve(cwd), '.devflow.yaml');
  if (!existsSync(path)) return {path, text: null, repository: null, number: null, name: null};
  if (lstatSync(path).isSymbolicLink()) throw new Error('Refusing to write through a symlinked .devflow.yaml');
  const text = readFileSync(path, 'utf8');
  const get = (key) => {
    const matched = [...text.matchAll(new RegExp('^[ \\t]*' + key + '[ \\t]*:[ \\t]*(.*)$','gm'))];
    if (matched.length > 1) throw new Error('Ambiguous duplicate field: ' + key);
    return matched.length ? matched[0][1].trim().replace(/^["'](.*)["']$/, '$1') : null;
  };
  const rawNumber = get('github_project_number');
  if (rawNumber && rawNumber !== 'null') positive(rawNumber,'github_project_number');
  return {path, text, repository: get('repository'), name: get('name'),
    number: rawNumber && rawNumber !== 'null' ? Number(rawNumber) : null};
}
function renderConfig(existing, {repo,name,number}) {
  let text = existing.text ?? readFileSync(projectTemplate,'utf8');
  // Match only the known configuration keys, and fail instead of rewriting unknown YAML.
  const changes = [['name',JSON.stringify(name)],['repository',repo],['github_project_number',number ?? 'null']];
  for (const [key,value] of changes) {
    const pattern = new RegExp('^([ \\t]*' + key + '[ \\t]*:[ \\t]*).*$','gm');
    if (![...text.matchAll(pattern)].length) throw new Error('Missing expected config key '+key+'; cannot safely modify YAML');
    text = text.replace(pattern,(_match,prefix)=>prefix+value);
  }
  return text;
}
function gh(transport,args,cwd,extra={}) {
  return transport(args,{cwd,json:true,...extra});
}
async function ask(question, prompt = null) {
  if (prompt) return prompt(question);
  const rl = createInterface({input:stdin,output:stdout});
  try {return (await rl.question(question)).trim();}
  finally {rl.close();}
}
function interactiveAllowed(options) {
  return options.interactive ?? (stdin.isTTY === true && stdout.isTTY === true);
}
function projectList(transport,owner,cwd) {
  const payload = gh(transport,['project','list','--owner',owner,'--limit','100','--format','json'],cwd);
  if (!Array.isArray(payload?.projects)) throw new Error('Unable to list GitHub Projects');
  if (payload.projects.length >= 100) throw new Error('100+ Projects; specify --project-number explicitly');
  return payload.projects;
}
function projectDetails(transport,owner,number,cwd) {
  const project = gh(transport,['project','view',String(number),'--owner',owner,'--format','json'],cwd);
  if (Number(project?.number) !== number || !project?.id) throw new Error('Could not verify selected GitHub Project');
  return project;
}
/**
 * If a config is missing, ask for the repository and existing board (TTY only).
 * Validate connections before saving, and never create remote resources here.
 * --apply enables noninteractive persistence only after successful validation.
 */
export async function configure({cwd=process.cwd(),repo,projectNumber,name,apply=false,interactive, prompt}={},
  transport=systemGh,output=console.log) {
  const base=resolve(cwd);
  if (!existsSync(base)) throw new Error('Target directory does not exist: '+base);
  const old=inspectConfig(base);
  const canAsk=interactiveAllowed({interactive});
  let targetRepo = repo || (validRepo(old.repository) ? old.repository : null);

  if (!targetRepo && canAsk) targetRepo=await ask('GitHub repository (owner/repository): ',prompt);
  if (!validRepo(targetRepo)) {
    throw new Error('Repository missing or invalid. Use --repo owner/repository, or run devflow config in an interactive terminal.');
  }
  const repository=gh(transport,['repo','view',targetRepo,'--json','nameWithOwner,defaultBranchRef'],base);
  if (repository?.nameWithOwner?.toLowerCase() !== targetRepo.toLowerCase()) {
    throw new Error('GitHub repository connection failed or returned an unexpected repository');
  }
  const owner=repository.nameWithOwner.split('/')[0];
  let chosen = projectNumber !== undefined ? positive(projectNumber,'--project-number') : old.number;
  let available = null;
  if (chosen == null) {
    available=projectList(transport,owner,base);
    if (canAsk) {
      const choices=available.map(p=>String(p.number)+' — '+p.title).join('\n');
      const answer=await ask('Existing GitHub Project number' + (choices?'\n'+choices+'\n':' (none found)') + '\n(Enter to configure later): ',prompt);
      if (answer) chosen=positive(answer,'Project number');
    }
  }
  let project=null;
  if (chosen != null) project=projectDetails(transport,owner,chosen,base);
  const title=validateProjectName(name || ((old.repository && old.repository !== targetRepo) ? (project?.title ?? targetRepo.split('/')[1]) : (old.name && old.name !== 'replace-me' ? old.name : project?.title ?? targetRepo.split('/')[1])));

  const content=renderConfig(old,{repo:targetRepo,name:title,number:chosen});
  const changed=content!==old.text;
  const result={
    repository:targetRepo,repositoryConnection:'ok',defaultBranch:repository.defaultBranchRef?.name ?? null,
    projectNumber:chosen,projectConnection:project?'ok':'not-configured',
    projectTitle:project?.title ?? null,projectCandidates:available?.map(p=>({number:p.number,title:p.title})),
    changed,action:changed?'save-config':'already-configured',
    saved:false,source:old.text?'existing':'new',
  };

  if (changed) {
    let approved=apply;
    if (!approved && canAsk) {
      const answer=await ask('Save verified configuration to .devflow.yaml? [y/N] ',prompt);
      approved=/^(y|yes|s|sim)$/i.test(answer);
    }
    if (approved) {
      if (old.text===null && existsSync(old.path)) throw new Error('Config was created concurrently; re-run');
      if (old.text!==null && readFileSync(old.path,'utf8')!==old.text) {
        throw new Error('Config changed during validation; re-run without overwriting');
      }
      writeFileSync(old.path,content,{encoding:'utf8',flag:old.text===null?'wx':'w'});
      result.saved=true;
    }
  }
  result.next=project?'devflow project':'Configure an existing project number, or create one with devflow project --apply';
  output?.(result);
  return result;
}
function normalizeOptions(raw) {
  const mapped=[];
  const seen=new Set();
  for (const opt of raw) {
    if (!opt?.name || !opt?.id) throw new Error('Status option missing name or ID');
    const name=aliases.get(opt.name) ?? opt.name;
    if (!DEVFLOW_STATUSES.includes(name)) {
      throw new Error('Unknown Status option "'+opt.name+'"; manual review required to protect existing items');
    }
    if (seen.has(name)) throw new Error('Ambiguous duplicate Status option "'+name+'"');
    seen.add(name);
    mapped.push({...opt,name});
  }
  return mapped;
}
function readStatus(transport,fieldId,cwd) {
  const query='query($id: ID!) { node(id: $id) { ... on ProjectV2SingleSelectField { id name options { id name color description } } } }';
  const result=gh(transport,['api','graphql','--input','-'],cwd,{
    input:JSON.stringify({query,variables:{id:fieldId}}),
  });
  const field=result?.data?.node;
  if (field?.id!==fieldId || field.name!=='Status' || !Array.isArray(field.options)) {
    throw new Error('Status field details cannot be verified through GitHub GraphQL');
  }
  return field;
}
function formatBoard(transport,settings,cwd) {
  if (!settings.number) return null;
  const project=projectDetails(transport,settings.owner,settings.number,cwd);
  const fields=gh(transport,['project','field-list',String(settings.number),'--owner',settings.owner,
    '--format','json','--limit','100'],cwd)?.fields;
  if (!Array.isArray(fields)) throw new Error('Could not read Project fields');
  const field=fields.find(f=>f.name==='Status');
  if (!field?.id) throw new Error('Missing Status field; manual repair required');
  const details=readStatus(transport,field.id,cwd);
  return {project,field:details};
}
function desiredOptions(field) {
  const normalized=normalizeOptions(field.options);
  const current=new Map(normalized.map(o=>[o.name,o]));
  return DEVFLOW_STATUSES.map((name,index)=>{
    const existing=current.get(name);
    return {
      ...(existing?.id?{id:existing.id}:{}),
      name,
      color:existing?.color ?? colors[index],
      description:existing?.description ?? descriptions[index],
    };
  });
}
function namesEqual(a,b) {
  return a.length===b.length && a.every((item,i)=>item===b[i]);
}
export function inspectAndRepairProject({cwd=process.cwd(),apply=false}={},
  transport=systemGh,output=console.log) {
  const base=resolve(cwd);
  const settings=readProjectSettings(base);
  if (!settings.number) {
    // Existing v0.3 helper creates or reuses a project only after explicit apply.
    const setup=setupProject({cwd:base,apply},transport,()=>{});
    const result={projectNumber:setup.projectNumber,action:setup.action,status:setup.status,
      apply,details:'Project number was not configured; inspect the new board before changing issues.'};
    output?.(result);
    return result;
  }
  const state=formatBoard(transport,settings,base);
  const existingNames=state.field.options.map(x=>x.name);
  const normalized=normalizeOptions(state.field.options);
  const normalizedNames=normalized.map(x=>x.name);
  const exact=namesEqual(existingNames,DEVFLOW_STATUSES);
  const planned=desiredOptions(state.field);
  const action=exact?'already-correct':'repair-status-options';
  const result={projectNumber:settings.number,projectTitle:state.project.title,
    repository:settings.repo,currentStatuses:existingNames,desiredStatuses:[...DEVFLOW_STATUSES],
    action,apply,changed:false,ready:exact};
  if (apply && !exact) {
    // Verify no concurrent modifications before mutation, preserving IDs to prevent data loss.
    const fresh=readStatus(transport,state.field.id,base);
    if (!namesEqual(fresh.options.map(x=>x.id+'|'+x.name),state.field.options.map(x=>x.id+'|'+x.name))) {
      throw new Error('Project Status changed during inspection; retry');
    }
    const query='mutation($input: UpdateProjectV2FieldInput!) { updateProjectV2Field(input: $input) { projectV2Field { ... on ProjectV2SingleSelectField { id name options { id name } } } } }';
    const resultMutation=gh(transport,['api','graphql','--input','-'],base,{
      input:JSON.stringify({query,variables:{input:{fieldId:state.field.id,singleSelectOptions:planned}}}),
    });
    if (resultMutation?.errors?.length || !resultMutation?.data?.updateProjectV2Field?.projectV2Field) {
      throw new Error('GitHub did not confirm the Status update');
    }
    const after=readStatus(transport,state.field.id,base);
    if (!namesEqual(after.options.map(x=>x.name),DEVFLOW_STATUSES)) {
      throw new Error('Status update was applied but the expected options could not be verified');
    }
    result.changed=true;
    result.ready=true;
  }
  output?.(result);
  return result;
}
export function startNext({cwd=process.cwd(),apply=false}={},
  transport=systemGh,git=systemGit,output=console.log) {
  const base=resolve(cwd);
  const preview=nextTask({cwd:base,apply:false},transport,()=>{});
  const result={...preview,action:apply?'claim-and-prepare-branch':'preview-next-task',apply};
  if (!apply) {output?.(result);return result;}
  if (!preview.issue) throw new Error(preview.reason);
  // Preflight predictable Git errors before marking an issue In progress.
  if (git(['status','--porcelain'],base).trim()) throw new Error('Working tree is dirty; cannot claim the task safely');
  const origin=git(['remote','get-url','origin'],base);
  const repo=readProjectSettings(base).repo;
  if (!new RegExp('(?:github\\.com[:/])'+repo.replace('/','\\/')+'(?:\\.git)?\\s*$').test(origin)) {
    throw new Error('Local origin does not match configured repository');
  }
  const claimed=nextTask({cwd:base,apply:true,issue:preview.issue.number},transport,()=>{});
  result.issue=claimed.issue;
  result.claimed=true;
  try {
    const prepared=prepareBranch({cwd:base,issue:preview.issue.number,apply:true},transport,git,()=>{});
    result.branch=prepared.branch;
    result.branchCreated=prepared.created===true;
    result.next='Use the DevFlow skill to implement and validate the claimed issue in the current interactive agent session. Do not launch another AI provider.';
  } catch(error) {
    result.branchError=error.message;
    result.recovery='Issue was claimed In progress, but branch preparation failed. Resolve Git errors; then run devflow task branch --issue '+preview.issue.number+' --apply. Do not claim another task.';
  }
  output?.(result);
  return result;
}
export function parseShortcutArgs(argv) {
  const [command,...args]=argv;
  const options={};
  for (let i=0;i<args.length;i++) {
    const item=args[i];
    if (!item.startsWith('--')) throw new Error('Unexpected argument: '+item);
    const [key,embedded]=item.slice(2).split('=',2);
    if (!['cwd','repo','project-number','name','apply'].includes(key)) {
      throw new Error('Unknown option --'+key);
    }
    if (key==='apply') options.apply=true;
    else {
      const value=embedded??args[++i];
      if (!value || value.startsWith('--')) throw new Error('Missing value for --'+key);
      options[key==='project-number'?'projectNumber':key]=value;
    }
  }
  return {command,options};
}
export async function shortcutMain(argv,transport=systemGh,git=systemGit,output=console.log,configPrompt=null) {
  const {command,options}=parseShortcutArgs(argv);
  if (command==='config') return configure({...options,prompt:configPrompt},transport,output);
  if (command==='project') return inspectAndRepairProject(options,transport,output);
  if (command==='next') return startNext(options,transport,git,output);
  throw new Error('Expected devflow config, devflow project or devflow next');
}
