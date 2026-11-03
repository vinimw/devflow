import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configure, inspectAndRepairProject, startNext, shortcutMain } from '../src/shortcuts.mjs';

function sandbox(t, configured=true) {
  const cwd=mkdtempSync(join(tmpdir(),'devflow-shortcuts-'));
  t.after(()=>rmSync(cwd,{recursive:true,force:true}));
  if(configured)writeFileSync(join(cwd,'.devflow.yaml'),
    'project:\n  name: Example\n  repository: example/myapp\n  github_project_number: 4\n');
  return cwd;
}
const VALID=['Backlog','Ready','In progress','In review','Done'];
function mock({status=VALID,project=4,issues=[]}={}) {
  const calls=[];
  const options=status.map((name,i)=>({name,id:'O'+i,color:'GRAY',description:name}));
  const transport=(args,extra={})=>{
    calls.push({args,extra});
    const key=args.slice(0,2).join(' ');
    if(key==='repo view'){
      if(args.includes('--json') && args.some(x=>String(x).includes('nameWithOwner')))return {
        nameWithOwner:'example/myapp',defaultBranchRef:{name:'main'}};
      return {defaultBranchRef:{name:'main'}};
    }
    if(key==='project list')return {projects:[{id:'PV_1',number:4,title:'Example'}]};
    if(key==='project view')return {id:'PV_1',number:project,title:'Example'};
    if(key==='project field-list')return {fields:[{id:'F_1',name:'Status',options}]};
    if(key==='project item-list')return {items:issues};
    if(key==='issue view')return {number:9,url:'https://github.com/example/myapp/issues/9',
      title:'feat(web): welcome screen',body:taskBody(),state:'OPEN',
      labels:[{name:'priority:P1'},{name:'project:web'},{name:'type:feature'}],createdAt:'2026-01-01T00:00:00Z'};
    if(key==='project item-edit')return '';
    if(key==='api graphql'){
      const parsed=JSON.parse(extra.input);
      if(parsed.query.startsWith('query('))return {data:{node:{id:'F_1',name:'Status',options}}};
      if(parsed.query.startsWith('mutation(')){
        const values=parsed.variables.input.singleSelectOptions;
        options.splice(0,options.length,...values.map((x,i)=>({id:x.id??'new'+i,name:x.name,color:x.color,description:x.description})));
        return {data:{updateProjectV2Field:{projectV2Field:{id:'F_1',name:'Status'}}}};
      }
    }
    throw new Error('Unexpected GitHub call: '+args.join(' '));
  };
  return {transport,calls,options};
}
function taskBody() {
  const sections=['Summary','Context','Objective','Scope','Technical Requirements','Expected Files / Modules',
    'Implementation Guidelines','Dependencies','Acceptance Criteria','Validation','Out of Scope','AI Agent Notes'];
  return sections.map(h=>'## '+h+'\n'+(h==='Dependencies'?'None':h==='Acceptance Criteria'?'- [ ] Work complete':'Detailed requirement')).join('\n');
}
const quiet=()=>{};

test('config validates both connections and previews changes without writing',async t=>{
  const cwd=sandbox(t,false),fake=mock();
  const result=await configure({cwd,repo:'example/myapp',projectNumber:'4',name:'Example'},fake.transport,quiet);
  assert.equal(result.repositoryConnection,'ok');
  assert.equal(result.projectConnection,'ok');
  assert.equal(result.saved,false);
  assert.equal(existsSync(join(cwd,'.devflow.yaml')),false);
});
test('config can ask for missing repository and Project and save with consent',async t=>{
  const cwd=sandbox(t,false),fake=mock(),questions=[];
  const answers=['example/myapp','4','y'];
  const prompt=async q=>{questions.push(q);return answers.shift();};
  const result=await configure({cwd,interactive:true,prompt},fake.transport,quiet);
  assert.equal(result.saved,true);
  assert.equal(result.projectNumber,4);
  assert.match(readFileSync(join(cwd,'.devflow.yaml'),'utf8'),/github_project_number: 4/);
  assert.equal(questions.length,3);
});
test('config does not overwrite existing settings until approved',async t=>{
  const cwd=sandbox(t),fake=mock();
  const original=readFileSync(join(cwd,'.devflow.yaml'),'utf8');
  const result=await configure({cwd,name:'Changed',interactive:false},fake.transport,quiet);
  assert.equal(result.saved,false);
  assert.equal(readFileSync(join(cwd,'.devflow.yaml'),'utf8'),original);
});
test('project reports valid statuses without writes',t=>{
  const cwd=sandbox(t),fake=mock();
  const result=inspectAndRepairProject({cwd},fake.transport,quiet);
  assert.equal(result.ready,true);
  assert.equal(result.action,'already-correct');
  assert.equal(fake.calls.filter(x=>x.args[0]==='api' && x.extra.input?.includes('mutation(')).length,0);
});
test('project repair preserves original option IDs while renaming familiar defaults',t=>{
  const cwd=sandbox(t),fake=mock({status:['Todo','Ready','In Progress','In review','Done']});
  const plan=inspectAndRepairProject({cwd},fake.transport,quiet);
  assert.equal(plan.action,'repair-status-options');
  assert.equal(plan.changed,false);
  const applied=inspectAndRepairProject({cwd,apply:true},fake.transport,quiet);
  assert.equal(applied.ready,true);
  assert.deepEqual(fake.options.map(x=>x.name),VALID);
  assert.equal(fake.options[0].id,'O0');
  assert.equal(fake.options[2].id,'O2');
});
test('project refuses unknown statuses rather than deleting existing work',t=>{
  const cwd=sandbox(t),fake=mock({status:['Urgent','Ready','In Progress','In review','Done']});
  assert.throws(()=>inspectAndRepairProject({cwd,apply:true},fake.transport,quiet),/Unknown Status option/);
  assert.equal(fake.calls.some(x=>x.extra.input?.includes('mutation(')),false);
});
test('next preview is read only; apply claims and prepares branch',t=>{
  const cwd=sandbox(t),fake=mock({issues:[{id:'PVTI_9',status:'Ready',
    content:{url:'https://github.com/example/myapp/issues/9'}}]});
  const gitCalls=[];
  const git=(args)=>{
    gitCalls.push(args);
    if(args[0]==='remote')return 'git@github.com:example/myapp.git';
    return '';
  };
  const preview=startNext({cwd},fake.transport,git,quiet);
  assert.equal(preview.issue.number,9);
  assert.equal(gitCalls.length,0);
  const result=startNext({cwd,apply:true},fake.transport,git,quiet);
  assert.equal(result.claimed,true);
  assert.equal(result.branchCreated,true);
  assert.equal(result.branch,'feat/9-welcome-screen');
  assert.equal(gitCalls.some(x=>x[0]==='switch'),true);
});
test('next refuses dirty working tree without claiming task',t=>{
  const cwd=sandbox(t),fake=mock({issues:[{id:'PVTI_9',status:'Ready',content:{url:'https://github.com/example/myapp/issues/9'}}]});
  const git=(args)=>args[0]==='status'?' M file.txt':'';
  assert.throws(()=>startNext({cwd,apply:true},fake.transport,git,quiet),/dirty/);
  assert.equal(fake.calls.some(x=>x.args[1]==='item-edit'),false);
});
test('short command dispatcher parses and validates flags',async t=>{
  const cwd=sandbox(t),fake=mock();
  const result=await shortcutMain(['config','--cwd',cwd],fake.transport,()=>{});
  assert.equal(result.repositoryConnection,'ok');
  assert.rejects(()=>shortcutMain(['config','--unknown'],fake.transport,quiet),/Unknown option/);
});
