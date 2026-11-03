import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {runGlobalAction, parseActionArgs} from '../scripts/global-action.mjs';

function fixture(t){
  const home=mkdtempSync(join(tmpdir(),'devflow-npm-flow-'));
  t.after(()=>rmSync(home,{recursive:true,force:true}));
  return {home,shell:'/bin/zsh',pathEnv:'/usr/bin:/bin'};
}
const silent=()=>{};
test('npm setup preview can be rejected without installing',async t=>{
  const settings=fixture(t);
  const result=await runGlobalAction('setup',{...settings,confirm:async()=>false,log:silent});
  assert.equal(result.applied,false);
  assert.equal(result.reason,'cancelled');
  assert.equal(existsSync(join(settings.home,'.claude')),false);
});
test('npm setup requires confirmation, creates both agent skills and global launcher',async t=>{
  const settings=fixture(t);
  const result=await runGlobalAction('setup',{...settings,confirm:async()=>true,log:silent});
  assert.equal(result.applied,true);
  assert.ok(existsSync(join(settings.home,'.claude/skills/devflow/SKILL.md')));
  assert.ok(existsSync(join(settings.home,'.agents/skills/devflow/SKILL.md')));
  assert.ok(existsSync(join(settings.home,'.local/bin/devflow')));
});
test('npm uninstall previews owned changes and requires consent',async t=>{
  const settings=fixture(t);
  await runGlobalAction('setup',{...settings,yes:true,log:silent});
  const rejected=await runGlobalAction('uninstall',{...settings,confirm:async()=>false,log:silent});
  assert.equal(rejected.applied,false);
  assert.ok(existsSync(join(settings.home,'.local/bin/devflow')));
  const accepted=await runGlobalAction('uninstall',{...settings,confirm:async()=>true,log:silent});
  assert.equal(accepted.applied,true);
  assert.equal(existsSync(join(settings.home,'.claude/skills/devflow')),false);
  assert.equal(existsSync(join(settings.home,'.agents/skills/devflow')),false);
  assert.equal(existsSync(join(settings.home,'.local/bin/devflow')),false);
  assert.equal(readFileSync(join(settings.home,'.zshrc'),'utf8'),'');
});
test('npm setup and uninstall can be repeated safely',async t=>{
  const settings=fixture(t);
  const installed=await runGlobalAction('setup',{...settings,yes:true,log:silent});
  assert.equal(installed.applied,true);
  const again=await runGlobalAction('setup',{...settings,yes:true,log:silent});
  assert.equal(again.reason,'nothing-to-do');
  await runGlobalAction('uninstall',{...settings,yes:true,log:silent});
  const removedAgain=await runGlobalAction('uninstall',{...settings,yes:true,log:silent});
  assert.equal(removedAgain.reason,'nothing-to-do');
});
test('npm script wrapper handles non-interactive stdin without accidentally applying',t=>{
  const settings=fixture(t);
  const command=spawnSync(process.execPath,['scripts/global-action.mjs','setup'],{
    cwd:process.cwd(),env:{...process.env,HOME:settings.home,SHELL:settings.shell,PATH:settings.pathEnv},
    input:'',encoding:'utf8',timeout:10000,
  });
  assert.equal(command.status,1);
  assert.match(command.stdout,/Terminal interativo não detectado/);
  assert.equal(existsSync(join(settings.home,'.claude')),false);
});
test('npm script wrapper accepts explicit --yes without a terminal',t=>{
  const settings=fixture(t);
  const command=spawnSync(process.execPath,['scripts/global-action.mjs','setup','--yes'],{
    cwd:process.cwd(),env:{...process.env,HOME:settings.home,SHELL:settings.shell,PATH:settings.pathEnv},
    input:'',encoding:'utf8',timeout:10000,
  });
  assert.equal(command.status,0,command.stderr);
  assert.ok(existsSync(join(settings.home,'.local/bin/devflow')));
});
test('npm command parser rejects unknown modes and flags',()=>{
  assert.deepEqual(parseActionArgs(['setup','--yes']),{action:'setup',options:{yes:true}});
  assert.deepEqual(parseActionArgs(['uninstall']),{action:'uninstall',options:{}});
  assert.throws(()=>parseActionArgs(['setup','--force']),/Opção desconhecida/);
  assert.throws(()=>parseActionArgs(['unknown']),/Usage/);
});
