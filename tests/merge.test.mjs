import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {assessPullRequest, mergeOpenPullRequests, parseMergeArgs} from '../src/merge.mjs';

const SHA = 'a'.repeat(40);
function pr(number, overrides = {}) {
  return {number, title:'Change '+number, url:'https://github.com/example/app/pull/'+number,
    state:'OPEN', isDraft:false, baseRefName:'main', headRefName:'feat/'+number,
    headRefOid:SHA, mergeable:'MERGEABLE', mergeStateStatus:'CLEAN',
    reviewDecision:'APPROVED', statusCheckRollup:[{__typename:'CheckRun',conclusion:'SUCCESS'}], ...overrides};
}
function fixture(t, prs) {
  const cwd=mkdtempSync(join(tmpdir(),'devflow-merge-'));
  t.after(()=>rmSync(cwd,{recursive:true,force:true}));
  writeFileSync(join(cwd,'.devflow.yaml'),'project:\n  name: App\n  repository: example/app\n  github_project_number: 4\n');
  const calls=[], merged=[];
  const gh=(args)=>{
    calls.push(args);
    if(args[0]==='repo' && args[1]==='view')return {nameWithOwner:'example/app',defaultBranchRef:{name:'main'}};
    if(args[0]==='pr' && args[1]==='list')return prs;
    if(args[0]==='pr' && args[1]==='view'){
      const number=Number(args[2]), existing=prs.find(p=>p.number===number);
      if(args.at(-1)==='number,state,mergedAt')return {number,state:merged.includes(number)?'MERGED':'OPEN',mergedAt:merged.includes(number)?'2026-01-01T00:00:00Z':null};
      return {...existing};
    }
    if(args[0]==='pr' && args[1]==='merge'){
      merged.push(Number(args[2]));
      return '';
    }
    throw new Error('Unexpected CLI call '+args.join(' '));
  };
  return {cwd,gh,calls,merged};
}

test('merge command parses only supported options',()=>{
  assert.deepEqual(parseMergeArgs([]),{dryRun:false});
  assert.deepEqual(parseMergeArgs(['--dry-run','--cwd','/tmp/app']),{dryRun:true,cwd:'/tmp/app'});
  assert.throws(()=>parseMergeArgs(['--unsafe']),/Usage/);
});

test('gates drafts, pending CI, reviews, conflicts and uncertain mergeability',()=>{
  assert.equal(assessPullRequest(pr(1,{isDraft:true}),'main').status,'skip');
  assert.equal(assessPullRequest(pr(1,{statusCheckRollup:[{conclusion:null}]}),'main').status,'blocked');
  assert.equal(assessPullRequest(pr(1,{statusCheckRollup:[{state:'FAILURE'}]}),'main').status,'blocked');
  assert.equal(assessPullRequest(pr(1,{reviewDecision:'REVIEW_REQUIRED'}),'main').status,'blocked');
  assert.equal(assessPullRequest(pr(1,{mergeable:'CONFLICTING',mergeStateStatus:'DIRTY'}),'main').status,'conflict');
  assert.equal(assessPullRequest(pr(1,{mergeable:'UNKNOWN'}),'main').status,'blocked');
  assert.equal(assessPullRequest(pr(1,{baseRefName:'develop'}),'main').status,'skip');
  assert.equal(assessPullRequest(pr(1,{statusCheckRollup:null}),'main').status,'blocked');
  assert.equal(assessPullRequest(pr(1),'main').status,'mergeable');
});

test('dry run never mutates GitHub',t=>{
  const f=fixture(t,[pr(1),pr(2,{isDraft:true})]);
  const result=mergeOpenPullRequests({cwd:f.cwd,dryRun:true},f.gh,()=>{});
  assert.equal(result.merged,0);
  assert.equal(result.results[0].status,'ready');
  assert.equal(result.results[1].status,'skipped');
  assert.equal(f.calls.some(x=>x[1]==='merge'),false);
});

test('merges only verified ready PRs and reports conflicts for separate handling',t=>{
  const f=fixture(t,[pr(1),pr(2,{mergeable:'CONFLICTING',mergeStateStatus:'DIRTY'}),pr(3,{statusCheckRollup:[{conclusion:null}]})]);
  const result=mergeOpenPullRequests({cwd:f.cwd},f.gh,()=>{});
  assert.deepEqual(f.merged,[1]);
  assert.equal(result.merged,1);
  assert.equal(result.conflicts,1);
  assert.equal(result.blocked,1);
  assert.match(result.results[1].next,/rerun devflow merge/);
  const command=f.calls.find(x=>x[1]==='merge');
  assert.ok(command.includes('--match-head-commit'));
  assert.ok(!command.includes('--admin'));
  assert.ok(!command.includes('--auto'));
});

test('rejects unsafe incomplete sweeps',t=>{
  const f=fixture(t,Array.from({length:500},(_,i)=>pr(i+1)));
  assert.throws(()=>mergeOpenPullRequests({cwd:f.cwd},f.gh,()=>{}),/500\+ open PRs/);
});
