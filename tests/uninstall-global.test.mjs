import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync,
  existsSync, symlinkSync, realpathSync, rmSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { globalInstall } from '../src/install-global.mjs';
import { globalUninstall, parseUninstallArgs } from '../src/uninstall-global.mjs';

const quiet=()=>{};
function home(t){
  const path=mkdtempSync(join(tmpdir(),'devflow-uninstall-'));
  t.after(()=>rmSync(path,{recursive:true,force:true}));
  return path;
}
const installOptions=(path)=>({home:path,shell:'/bin/zsh',pathEnv:'/usr/bin:/bin',apply:true});
test('uninstall preview never modifies files',t=>{
  const dir=home(t);
  globalInstall(installOptions(dir),quiet);
  const original=readFileSync(join(dir,'.zshrc'),'utf8');
  const result=globalUninstall({home:dir},quiet);
  assert.equal(result.mode,'preview');
  assert.equal(result.files.filter(x=>x.action==='remove').length,3);
  assert.equal(result.files.filter(x=>x.action==='remove-managed-block').length,1);
  assert.ok(existsSync(join(dir,'.local/bin/devflow')));
  assert.equal(readFileSync(join(dir,'.zshrc'),'utf8'),original);
});
test('uninstall apply removes installed links, launcher and DevFlow PATH block',t=>{
  const dir=home(t);
  globalInstall(installOptions(dir),quiet);
  const result=globalUninstall({home:dir,apply:true},quiet);
  assert.equal(result.ok,true);
  assert.equal(existsSync(join(dir,'.claude/skills/devflow')),false);
  assert.equal(existsSync(join(dir,'.agents/skills/devflow')),false);
  assert.equal(existsSync(join(dir,'.local/bin/devflow')),false);
  assert.equal(readFileSync(join(dir,'.zshrc'),'utf8'),'');
  assert.ok(existsSync(dir));
});
test('install after uninstall works cleanly',t=>{
  const dir=home(t);
  globalInstall(installOptions(dir),quiet);
  globalUninstall({home:dir,apply:true},quiet);
  const reinstall=globalInstall(installOptions(dir),quiet);
  assert.equal(reinstall.ok,true);
  assert.ok(existsSync(join(dir,'.claude/skills/devflow/SKILL.md')));
  assert.ok(existsSync(join(dir,'.local/bin/devflow')));
});
test('uninstall is idempotent',t=>{
  const dir=home(t);
  globalInstall(installOptions(dir),quiet);
  globalUninstall({home:dir,apply:true},quiet);
  const again=globalUninstall({home:dir,apply:true},quiet);
  assert.equal(again.files.filter(x=>x.action==='remove').length,0);
});
test('preserves custom files, directories and unrelated symbolic links',t=>{
  const dir=home(t);
  const dirTarget=join(dir,'.claude/skills/devflow');
  mkdirSync(dirTarget,{recursive:true});
  writeFileSync(join(dirTarget,'notes.md'),'keep me');
  mkdirSync(join(dir,'.agents/skills'),{recursive:true});
  const other=join(dir,'other');
  mkdirSync(other);
  symlinkSync(other,join(dir,'.agents/skills/devflow'));
  mkdirSync(join(dir,'.local/bin'),{recursive:true});
  writeFileSync(join(dir,'.local/bin/devflow'),'my own tool\n');
  writeFileSync(join(dir,'.zshrc'),'export PATH="$HOME/.local/bin:$PATH"\n');
  const result=globalUninstall({home:dir,apply:true},quiet);
  assert.equal(result.files.filter(x=>x.action==='preserve').length,4);
  assert.equal(readFileSync(join(dirTarget,'notes.md'),'utf8'),'keep me');
  assert.equal(realpathSync(join(dir,'.agents/skills/devflow')),realpathSync(other));
  assert.equal(readFileSync(join(dir,'.local/bin/devflow'),'utf8'),'my own tool\n');
  assert.match(readFileSync(join(dir,'.zshrc'),'utf8'),/export PATH/);
});
test('preserves unrelated profile content when removing owned block',t=>{
  const dir=home(t);
  writeFileSync(join(dir,'.zshrc'),'export EDITOR=vim\n');
  globalInstall(installOptions(dir),quiet);
  globalUninstall({home:dir,apply:true},quiet);
  assert.equal(readFileSync(join(dir,'.zshrc'),'utf8'),'export EDITOR=vim\n');
});
test('preserves unknown shell profiles and can skip shell cleanup',t=>{
  const dir=home(t);
  globalInstall(installOptions(dir),quiet);
  const result=globalUninstall({home:dir,apply:true,skipShell:true},quiet);
  assert.equal(result.files.some(x=>x.kind==='profile'),false);
  assert.match(readFileSync(join(dir,'.zshrc'),'utf8'),/# DevFlow global CLI PATH/);
});
test('refuses unknown uninstall flags',()=>{
  assert.deepEqual(parseUninstallArgs(['global','--apply']),{apply:true});
  assert.deepEqual(parseUninstallArgs(['global','--skip-shell']),{skipShell:true});
  assert.throws(()=>parseUninstallArgs(['local']),/Usage/);
  assert.throws(()=>parseUninstallArgs(['global','--force']),/Unknown uninstall option/);
});
