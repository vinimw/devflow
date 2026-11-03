import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validateTaskBody, dependencies, pickReady, branchName,
  parseTaskArgs, createTask, nextTask, reviewTask, completeTask, prepareBranch, openTaskPr,
} from '../src/tasks.mjs';

const headings = ['Summary','Context','Objective','Scope','Technical Requirements',
  'Expected Files / Modules','Implementation Guidelines','Dependencies',
  'Acceptance Criteria','Validation','Out of Scope','AI Agent Notes'];
const body = headings.map((heading) => '## '+heading+'\n\n'+
  (heading === 'Dependencies' ? 'None' : heading === 'Acceptance Criteria' ? '- [ ] Works correctly' : 'Complete specification')).join('\n\n');
function issue(n, priority='P1', area='web', type='feature', status='OPEN', overrides={}) {
  return { number:n, url:'https://github.com/example/myapp/issues/'+n, title:'feat(web): New dashboard',
    body, labels:[{name:'priority:'+priority},{name:'project:'+area},{name:'type:'+type}],
    state:status, createdAt:'2026-01-01T00:00:00Z', ...overrides };
}
function item(n, status='Ready') {
  return {id:'PVTI_'+n, status, content:{url:'https://github.com/example/myapp/issues/'+n}};
}
function workspace(t) {
  const cwd=mkdtempSync(join(tmpdir(),'devflow-tasks-'));
  t.after(()=>rmSync(cwd,{force:true,recursive:true}));
  writeFileSync(join(cwd,'.devflow.yaml'), 'project:\n  name: Example\n  repository: example/myapp\n  github_project_number: 4\n');
  return cwd;
}
function ghMock(data={}) {
  const calls=[];
  const board=data.items??[item(9)];
  const issues=data.issues??new Map([[9,issue(9)]]);
  const gh=(args)=>{
    calls.push(args);
    const key=args.slice(0,2).join(' ');
    if(key==='project item-list')return {items:board};
    if(key==='project view')return {id:'PVT_1',number:4};
    if(key==='project field-list')return {fields:[{id:'FIELD_1',name:'Status',options:['Backlog','Ready','In progress','In review','Done'].map((name,i)=>({id:'O'+i,name}))}]};
    if(key==='project item-edit')return '';
    if(key==='issue view')return issues.get(Number(args[2]));
    if(key==='issue list')return [...issues.values()].map(({number,title})=>({number,title}));
    if(key==='issue create')return 'https://github.com/example/myapp/issues/10';
    if(key==='pr list')return [];
    if(key==='pr view')return data.pr;
    if(key==='pr create')return 'https://github.com/example/myapp/pull/3';
    if(key==='repo view')return {defaultBranchRef:{name:'main'}};
    if(key==='issue close')return '';
    throw new Error('Unexpected mock call '+args.join(' '));
  };
  return {gh,calls};
}
const silent=()=>{};

test('task bodies require all populated sections and acceptance criteria',()=>{
  assert.equal(validateTaskBody(body).get('dependencies'),'None');
  assert.deepEqual(dependencies(body),[]);
  assert.deepEqual(dependencies(body.replace('## Dependencies\n\nNone','## Dependencies\n\n#12 and #7')),[12,7]);
  assert.throws(()=>validateTaskBody('## Summary\nhello'),/missing required/);
  assert.throws(()=>dependencies(body.replace('## Dependencies\n\nNone','## Dependencies\n\nDo some work first')),/issue references/);
});
test('only highest priority Ready issue is selected',()=>{
  const items=[item(9),item(10)];
  const issues=new Map([[9,issue(9,'P2')],[10,issue(10,'P0')]]);
  assert.equal(pickReady({items,issues,repo:'example/myapp'}).issue.number,10);
  items.push(item(11,'Backlog'));
  issues.set(11,issue(11,'P0'));
  assert.equal(pickReady({items,issues,repo:'example/myapp'}).issue.number,10);
});
test('global WIP blocks all selection',()=>{
  const result=pickReady({items:[item(9),item(10,'In review')],issues:new Map([[9,issue(9)],[10,issue(10)]]),repo:'example/myapp'});
  assert.equal(result.issue,null);
  assert.match(result.reason,/Another task/);
});
test('dependencies require both closed issue and Done board item',()=>{
  const task=issue(9,'P0','web','feature','OPEN',{body:body.replace('## Dependencies\n\nNone','## Dependencies\n\n#10')});
  let result=pickReady({items:[item(9),item(10,'Done')],issues:new Map([[9,task],[10,issue(10,'P3','api','feature','OPEN')]]),repo:'example/myapp'});
  assert.equal(result.issue,null);
  result=pickReady({items:[item(9),item(10,'Done')],issues:new Map([[9,task],[10,issue(10,'P3','api','feature','CLOSED')]]),repo:'example/myapp'});
  assert.equal(result.issue.number,9);
});
test('next dry run does not change board; apply changes status', t=>{
  const cwd=workspace(t), fixture=ghMock();
  nextTask({cwd},fixture.gh,silent);
  assert.equal(fixture.calls.some(args=>args[1]==='item-edit'),false);
  nextTask({cwd,apply:true,issue:9},fixture.gh,silent);
  assert.equal(fixture.calls.some(args=>args[1]==='item-edit'),true);
  assert.throws(()=>nextTask({cwd,apply:true,issue:10},fixture.gh,silent),/highest-priority/);
});
test('task create validates, previews, refuses duplicate and recovers failed sync', t=>{
  const cwd=workspace(t),filename=join(cwd,'issue.md');
  writeFileSync(filename,body);
  const fixture=ghMock({issues:new Map([[9,issue(9)]])});
  const result=createTask({cwd,title:'fix(web): Repair plants',bodyFile:filename},fixture.gh,silent);
  assert.equal(result.apply,false);
  assert.equal(fixture.calls.some(args=>args[1]==='create'),false);
  assert.throws(()=>createTask({cwd,title:'feat(web): New dashboard',bodyFile:filename},fixture.gh,silent),/already exists/);
  const created=createTask({cwd,title:'fix(web): Repair plants',bodyFile:filename,apply:true},fixture.gh,silent,
    ()=>{throw new Error('Board temporarily unavailable');});
  assert.equal(created.number,10);
  assert.match(created.recovery,/github sync/);
});
test('branch names follow GitHub Flow and safe slugs',()=>{
  assert.equal(branchName(issue(9)),'feat/9-new-dashboard');
  assert.equal(branchName(issue(9,'P1','web','bug')),'fix/9-new-dashboard');
});
test('branch preview requires matching clean local repo; apply only then runs fetch/switch',t=>{
  const cwd=workspace(t),fixture=ghMock({items:[item(9,'In progress')]});
  const gitCalls=[];
  const git=(args)=>{
    gitCalls.push(args);
    if(args[0]==='remote')return 'git@github.com:example/myapp.git';
    return '';
  };
  const preview=prepareBranch({cwd,issue:9},fixture.gh,git,silent);
  assert.equal(preview.branch,'feat/9-new-dashboard');
  assert.equal(gitCalls.some(args=>args[0]==='switch'),false);
  prepareBranch({cwd,issue:9,apply:true},fixture.gh,git,silent);
  assert.equal(gitCalls.some(args=>args[0]==='switch'),true);
});
test('pr creates draft only after clean committed and pushed branch',t=>{
  const cwd=workspace(t),fixture=ghMock({items:[item(9,'In progress')]});
  const git=(args)=>{
    if(args[0]==='branch')return 'feat/9-new-dashboard';
    if(args[0]==='rev-list')return '0';
    return '';
  };
  openTaskPr({cwd,issue:9},fixture.gh,git,silent);
  assert.equal(fixture.calls.some(args=>args[1]==='create'),false);
  openTaskPr({cwd,issue:9,apply:true},fixture.gh,git,silent);
  const command=fixture.calls.find(args=>args[0]==='pr'&&args[1]==='create');
  assert.ok(command.includes('--draft'));
});
test('review verifies PR identity, branch, base and reference',t=>{
  const cwd=workspace(t),pr={number:3,state:'OPEN',headRefName:'feat/9-new-dashboard',baseRefName:'main',body:'Closes #9'};
  const fixture=ghMock({items:[item(9,'In progress')],pr});
  reviewTask({cwd,issue:9,pr:3,apply:true},fixture.gh,silent);
  assert.equal(fixture.calls.some(args=>args[1]==='item-edit'),true);
  const invalid=ghMock({items:[item(9,'In progress')],pr:{...pr,headRefName:'fix/77-other'}});
  assert.throws(()=>reviewTask({cwd,issue:9,pr:3,apply:true},invalid.gh,silent),/does not match/);
});
test('Done requires verified merged PR and closes open issue',t=>{
  const cwd=workspace(t),pr={number:3,mergedAt:'2026-01-01T10:00:00Z',
    headRefName:'feat/9-new-dashboard',baseRefName:'main',body:'Closes #9'};
  const fixture=ghMock({items:[item(9,'In review')],pr});
  completeTask({cwd,issue:9,pr:3},fixture.gh,silent);
  assert.equal(fixture.calls.some(args=>args[1]==='item-edit'),false);
  completeTask({cwd,issue:9,pr:3,apply:true},fixture.gh,silent);
  assert.equal(fixture.calls.some(args=>args[1]==='item-edit'),true);
  assert.equal(fixture.calls.some(args=>args[1]==='close'),true);
  const invalid=ghMock({items:[item(9,'In review')],pr:{...pr,mergedAt:null}});
  assert.throws(()=>completeTask({cwd,issue:9,pr:3,apply:true},invalid.gh,silent),/Verified merged PR/);
});
test('task CLI parser validates options',()=>{
  assert.equal(parseTaskArgs(['next','--apply']).opts.apply,true);
  assert.deepEqual(parseTaskArgs(['review','--issue','9','--pr','3']).opts,{issue:'9',pr:'3'});
  assert.throws(()=>parseTaskArgs(['next','--unknown']),/Unknown option/);
});
