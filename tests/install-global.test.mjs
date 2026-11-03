import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, readFileSync, writeFileSync,
  lstatSync, realpathSync, existsSync, rmSync, symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { globalInstall, parseInstallArgs } from '../src/install-global.mjs';

const quiet = () => {};
function fakeHome(t) {
  const home = mkdtempSync(join(tmpdir(), 'devflow-install-global-'));
  t.after(() => rmSync(home, {recursive:true,force:true}));
  return home;
}
const testOptions = (home, extra={}) => ({
  home, shell: '/bin/zsh', pathEnv: '/usr/bin:/bin', ...extra,
});

test('preview creates no files in a new home',t=>{
  const home = fakeHome(t);
  const result = globalInstall(testOptions(home),quiet);
  assert.equal(result.ok,true);
  assert.equal(result.mode,'preview');
  assert.equal(result.files.filter(x=>x.action==='create').length,4);
  assert.equal(existsSync(join(home,'.claude')),false);
  assert.equal(existsSync(join(home,'.agents')),false);
  assert.equal(existsSync(join(home,'.local')),false);
});
test('apply installs both global skills and a functional CLI launcher',t=>{
  const home = fakeHome(t);
  const result = globalInstall(testOptions(home,{apply:true}),quiet);
  assert.equal(result.ok,true);
  for(const relativePath of ['.claude/skills/devflow','.agents/skills/devflow']) {
    const target=join(home,relativePath);
    assert.ok(lstatSync(target).isSymbolicLink());
    assert.ok(existsSync(join(target,'SKILL.md')));
  }
  const wrapper=join(home,'.local/bin/devflow');
  const run=spawnSync(wrapper,['help'],{encoding:'utf8',timeout:12000});
  assert.equal(run.status,0,run.stderr);
  assert.match(run.stdout,/DevFlow v0\.9/);
  const profile=readFileSync(join(home,'.zshrc'),'utf8');
  assert.match(profile,/export PATH="\$HOME\/\.local\/bin:\$PATH"/);
});
test('running apply twice leaves all installed files unchanged',t=>{
  const home=fakeHome(t);
  globalInstall(testOptions(home,{apply:true}),quiet);
  const before=readFileSync(join(home,'.zshrc'),'utf8');
  const again=globalInstall(testOptions(home,{apply:true}),quiet);
  assert.ok(again.files.every(x=>x.action==='unchanged'));
  assert.equal(readFileSync(join(home,'.zshrc'),'utf8'),before);
});
test('conflicting existing directories fail closed without modifying any destination',t=>{
  const home=fakeHome(t);
  const occupied=join(home,'.claude/skills/devflow');
  mkdirSync(occupied,{recursive:true});
  const result=globalInstall(testOptions(home),quiet);
  assert.equal(result.ok,false);
  assert.equal(result.files.find(x=>x.path===occupied).action,'conflict');
  assert.throws(()=>globalInstall(testOptions(home,{apply:true}),quiet),/installation blocked/);
  assert.ok(lstatSync(occupied).isDirectory());
  assert.equal(existsSync(join(home,'.agents')),false);
});
test('conflicting symlink destination is preserved',t=>{
  const home=fakeHome(t);
  const other=join(home,'other-skill');
  mkdirSync(other);
  mkdirSync(join(home,'.agents/skills'),{recursive:true});
  symlinkSync(other,join(home,'.agents/skills/devflow'));
  assert.throws(()=>globalInstall(testOptions(home,{apply:true}),quiet),/installation blocked/);
  assert.equal(realpathSync(join(home,'.agents/skills/devflow')),realpathSync(other));
});
test('existing unrelated zsh profile content is retained',t=>{
  const home=fakeHome(t);
  writeFileSync(join(home,'.zshrc'),'export EDITOR=vim\n');
  globalInstall(testOptions(home,{apply:true}),quiet);
  const content=readFileSync(join(home,'.zshrc'),'utf8');
  assert.match(content,/export EDITOR=vim/);
  assert.match(content,/# DevFlow global CLI PATH/);
});
test('skip-shell mode makes no changes to a shell profile',t=>{
  const home=fakeHome(t);
  const result=globalInstall(testOptions(home,{apply:true,skipShell:true}),quiet);
  assert.equal(result.ok,true);
  assert.equal(existsSync(join(home,'.zshrc')),false);
  assert.ok(existsSync(join(home,'.local/bin/devflow')));
});
test('install CLI rejects unsupported options and missing scope',()=>{
  assert.deepEqual(parseInstallArgs(['global','--apply']),{apply:true});
  assert.deepEqual(parseInstallArgs(['global','--skip-shell']),{skipShell:true});
  assert.throws(()=>parseInstallArgs(['local']),/Usage/);
  assert.throws(()=>parseInstallArgs(['global','--force']),/Unknown install option/);
});
