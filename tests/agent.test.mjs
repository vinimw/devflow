import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installAgentSkill, subscriptionPreflight, handoffPrompt, agentMain } from '../src/agent.mjs';

const headings = ['Summary','Context','Objective','Scope','Technical Requirements',
  'Expected Files / Modules','Implementation Guidelines','Dependencies',
  'Acceptance Criteria','Validation','Out of Scope','AI Agent Notes'];
const body = headings.map(h=>'## '+h+'\n\n'+
  (h==='Dependencies'?'None':h==='Acceptance Criteria'?'- [ ] Verify the flow':'Complete specification')).join('\n\n');
function workspace(t) {
  const cwd=mkdtempSync(join(tmpdir(),'devflow-agent-'));
  t.after(()=>rmSync(cwd,{recursive:true,force:true}));
  writeFileSync(join(cwd,'.devflow.yaml'),
    'project:\n  name: Example\n  repository: example/myapp\n  github_project_number: 4\n');
  return cwd;
}
function mock(override={}) {
  const calls=[];
  const gh=(args)=>{
    calls.push(args);
    const key=args.slice(0,2).join(' ');
    if (key==='issue view') return {number:9,url:'https://github.com/example/myapp/issues/9',
      state:'OPEN',title:'feat(web): New dashboard',body,
      labels:[{name:'priority:P1'},{name:'project:web'},{name:'type:feature'}],createdAt:'2026-01-01T00:00:00Z'};
    if (key==='project item-list') return {items:[{id:'PVTI_9',status:override.status??'In progress',
      content:{url:'https://github.com/example/myapp/issues/9'}}]};
    if (key==='repo view') return {defaultBranchRef:{name:'main'}};
    throw new Error('Unexpected GitHub operation: '+args.join(' '));
  };
  return {gh,calls};
}
const silent=()=>{};

test('skill installation previews without writing files',t=>{
  const cwd=workspace(t);
  const plan=installAgentSkill({cwd},silent);
  assert.equal(plan.mode,'preview');
  assert.equal(plan.files.length,12);
  assert.equal(existsSync(join(cwd,'.agents/skills/devflow/SKILL.md')),false);
});
test('skill installation creates files for both agents and is idempotent',t=>{
  const cwd=workspace(t);
  const result=installAgentSkill({cwd,apply:true},silent);
  assert.equal(result.files.length,12);
  assert.equal(existsSync(join(cwd,'.agents/skills/devflow/SKILL.md')),true);
  assert.equal(existsSync(join(cwd,'.claude/skills/devflow/references/subscription-safety.md')),true);
  const next=installAgentSkill({cwd,apply:true},silent);
  assert.ok(next.files.every(x=>x.action==='unchanged'));
});
test('installation refuses to modify existing skill files',t=>{
  const cwd=workspace(t);
  mkdirSync(join(cwd,'.agents/skills/devflow'),{recursive:true});
  writeFileSync(join(cwd,'.agents/skills/devflow/SKILL.md'),'custom rules');
  assert.throws(()=>installAgentSkill({cwd,provider:'codex',apply:true},silent),/refusing overwrite/);
  assert.equal(readFileSync(join(cwd,'.agents/skills/devflow/SKILL.md'),'utf8'),'custom rules');
});
test('preflight explicitly reports lack of financial guarantee',()=>{
  const status=subscriptionPreflight({env:{}},silent);
  assert.equal(status.invokesProvider,false);
  assert.equal(status.includedOnlyUsageAttestable,false);
  assert.equal(status.unattendedSafe,false);
  assert.equal(status.handoffAllowed,true);
  const blocked=subscriptionPreflight({env:{OPENAI_API_KEY:'secret'}},silent);
  assert.equal(blocked.handoffAllowed,false);
  assert.deepEqual(blocked.apiCredentialVariablesDetected,['OPENAI_API_KEY']);
});
test('handoff previews without invoking AI or writing files',t=>{
  const cwd=workspace(t),fixture=mock();
  const handoff=handoffPrompt({cwd,issue:9},fixture.gh,silent,{});
  assert.equal(handoff.mode,'preview');
  assert.equal(handoff.unattendedSafe,false);
  assert.equal(handoff.financialGuarantee,'not-verifiable');
  assert.match(handoff.prompt,/included allowance/);
  assert.match(handoff.prompt,/Closes #9/);
  assert.equal(existsSync(join(cwd,handoff.path)),false);
  assert.deepEqual(fixture.calls.map(x=>x.slice(0,2).join(' ')),['issue view','project item-list','repo view']);
});
test('handoff requires in-progress state',t=>{
  const cwd=workspace(t);
  assert.throws(()=>handoffPrompt({cwd,issue:9},mock({status:'Ready'}).gh,silent,{}),/In progress/);
});
test('handoff rejects API credentials before querying GitHub',t=>{
  const cwd=workspace(t),fixture=mock();
  assert.throws(()=>handoffPrompt({cwd,issue:9},fixture.gh,silent,
    {ANTHROPIC_API_KEY:'secret'}),/API credentials/);
  assert.equal(fixture.calls.length,0);
});
test('handoff writes one file only on apply, never overwrites',t=>{
  const cwd=workspace(t),fixture=mock();
  const result=handoffPrompt({cwd,issue:9,provider:'claude',apply:true},fixture.gh,silent,{});
  assert.equal(result.mode,'written');
  assert.equal(existsSync(join(cwd,result.path)),true);
  assert.throws(()=>handoffPrompt({cwd,issue:9,provider:'claude',apply:true},fixture.gh,silent,{}),/already exists/);
});
test('agent CLI parses supported commands and refuses unsupported flags',t=>{
  const cwd=workspace(t);
  const result=agentMain(['install','--cwd',cwd,'--provider','codex'],mock().gh,silent,{});
  assert.equal(result.mode,'preview');
  assert.throws(()=>agentMain(['install','--unexpected'],mock().gh,silent,{}),/Unknown option/);
});
