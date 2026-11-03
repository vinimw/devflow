import { readProjectSettings, systemGh } from './project-v2.mjs';

const TERMINAL_SUCCESS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const TERMINAL_FAILURE = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE']);
const PREVIEW_FIELDS = 'number,title,url,state,isDraft,baseRefName,headRefName,headRefOid,isCrossRepository,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup';
const MAX_PRS = 500;

export function parseMergeArgs(args = []) {
  const options = { dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--cwd') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error('--cwd requires a path');
      options.cwd = value;
    } else throw new Error('Usage: devflow merge [--dry-run] [--cwd DIR]');
  }
  return options;
}

function assertCollection(value) {
  if (!Array.isArray(value)) throw new Error('Could not inspect the full list of open pull requests');
  if (value.length >= MAX_PRS) throw new Error('500+ open PRs: refusing a possibly incomplete sweep');
  return value;
}

function checkResult(check) {
  if (check?.__typename === 'CheckRun' || 'conclusion' in (check ?? {})) {
    if (check.conclusion == null) return 'pending';
    return TERMINAL_SUCCESS.has(check.conclusion) ? 'passed' : 'blocked';
  }
  if (check?.__typename === 'StatusContext' || 'state' in (check ?? {})) {
    if (check.state === 'SUCCESS') return 'passed';
    if (check.state === 'PENDING' || check.state === 'EXPECTED') return 'pending';
    return 'blocked';
  }
  return 'unknown';
}

export function assessPullRequest(pr, defaultBranch) {
  if (pr?.state !== 'OPEN') return { status: 'skip', reason: 'PR is not open' };
  if (pr.baseRefName !== defaultBranch) return { status: 'skip', reason: 'PR does not target the default branch' };
  if (pr.isDraft) return { status: 'skip', reason: 'PR is Draft' };
  if (!pr.headRefOid || !/^[0-9a-f]{40}$/i.test(pr.headRefOid)) return { status: 'skip', reason: 'Head commit SHA not verified' };
  if (pr.reviewDecision === 'CHANGES_REQUESTED' || pr.reviewDecision === 'REVIEW_REQUIRED') {
    return { status: 'blocked', reason: 'Required review is pending or changes requested' };
  }
  if (pr.mergeable === 'CONFLICTING' || pr.mergeStateStatus === 'DIRTY') {
    return { status: 'conflict', reason: 'Branch conflicts with the default branch' };
  }
  if (pr.mergeable !== 'MERGEABLE') return { status: 'blocked', reason: 'Mergeability is unknown or pending recalculation' };
  if (!Array.isArray(pr.statusCheckRollup)) return { status: 'blocked', reason: 'Unable to verify CI checks' };
  const checks = pr.statusCheckRollup.map(checkResult);
  if (checks.includes('blocked') || checks.includes('unknown')) return { status: 'blocked', reason: 'CI is failing or has an unknown result' };
  if (checks.includes('pending')) return { status: 'blocked', reason: 'CI is still running; retry devflow merge later' };
  if (['BLOCKED', 'BEHIND', 'UNSTABLE', 'UNKNOWN', 'DIRTY', 'DRAFT'].includes(pr.mergeStateStatus)) {
    return { status: 'blocked', reason: 'GitHub reports a merge restriction: ' + pr.mergeStateStatus };
  }
  if (pr.mergeStateStatus !== 'CLEAN' && pr.mergeStateStatus !== 'HAS_HOOKS') {
    return { status: 'blocked', reason: 'Merge state cannot be verified safely' };
  }
  return { status: 'mergeable', reason: 'Ready to merge' };
}

function view(gh, repo, number) {
  const pr = gh(['pr', 'view', String(number), '--repo', repo, '--json', PREVIEW_FIELDS], {json: true});
  if (pr?.number !== number) throw new Error('GitHub returned an unexpected PR identity');
  return {...pr, state: pr.state ?? 'OPEN'};
}

function list(gh, repo) {
  return assertCollection(gh(['pr', 'list', '--repo', repo, '--state', 'open', '--limit', String(MAX_PRS), '--json', PREVIEW_FIELDS], {json: true}));
}

function defaultBranch(gh, repo) {
  const response = gh(['repo', 'view', repo, '--json', 'nameWithOwner,defaultBranchRef'], {json: true});
  if (response?.nameWithOwner?.toLowerCase() !== repo.toLowerCase() || !response.defaultBranchRef?.name) {
    throw new Error('Cannot verify the configured repository or default branch');
  }
  return response.defaultBranchRef.name;
}

/**
 * A user invoking "devflow merge" authorizes one bounded sweep of open PRs.
 * Never enable admin bypass, auto-merge, force push or bypassed checks.
 * Conflicts are reported to the interactive agent for isolated resolution,
 * not auto-fixed by the CLI. Updated conflict PRs are deferred until rerun.
 */
export function mergeOpenPullRequests({cwd = process.cwd(), dryRun = false} = {}, gh = systemGh, output = console.log) {
  const settings = readProjectSettings(cwd);
  const base = defaultBranch(gh, settings.repo);
  const open = list(gh, settings.repo).sort((a, b) => a.number - b.number);
  const results = [];
  for (const item of open) {
    const record = {number: item.number, url: item.url, title: item.title, status: 'skipped'};
    try {
      const pr = view(gh, settings.repo, item.number);
      let assessment = assessPullRequest(pr, base);
      record.reason = assessment.reason;
      if (assessment.status === 'conflict') {
        record.status = 'conflict';
        record.next = 'Resolve in a separate clean worktree with the interactive agent, validate, commit, push without force, then rerun devflow merge. Do not merge this PR in the current sweep.';
      } else if (assessment.status === 'blocked' || assessment.status === 'skip') {
        record.status = assessment.status === 'blocked' ? 'blocked' : 'skipped';
      } else if (dryRun) {
        record.status = 'ready';
      } else {
        // Refresh immediately before mutation. gh enforces branch protection.
        const refreshed = view(gh, settings.repo, item.number);
        assessment = assessPullRequest(refreshed, base);
        if (assessment.status !== 'mergeable' || refreshed.headRefOid !== pr.headRefOid) {
          record.status = 'blocked';
          record.reason = 'PR changed during inspection; rerun when stable: ' + assessment.reason;
        } else {
          gh(['pr', 'merge', String(item.number), '--repo', settings.repo, '--merge', '--match-head-commit', pr.headRefOid], {json: false});
          const verified = gh(['pr', 'view', String(item.number), '--repo', settings.repo, '--json', 'number,state,mergedAt'], {json: true});
          if (verified?.number !== item.number || !verified.mergedAt) {
            record.status = 'unverified';
            record.reason = 'Merge attempted but GitHub did not confirm mergedAt; inspect before retrying';
          } else {
            record.status = 'merged';
            record.reason = 'GitHub verified merge';
          }
        }
      }
    } catch (error) {
      record.status = 'blocked';
      record.reason = String(error.message || error).slice(0,700);
    }
    results.push(record);
    output?.(record);
  }
  const summary = {repository: settings.repo, defaultBranch: base, dryRun, total: results.length,
    merged: results.filter(r => r.status === 'merged').length,
    conflicts: results.filter(r => r.status === 'conflict').length,
    blocked: results.filter(r => r.status === 'blocked' || r.status === 'unverified').length,
    results};
  output?.({summary: {repository: summary.repository, total: summary.total, merged: summary.merged,
    conflicts: summary.conflicts, blocked: summary.blocked, dryRun}});
  return summary;
}

export function mergeMain(argv, gh = systemGh, output = console.log) {
  return mergeOpenPullRequests(parseMergeArgs(argv), gh, output);
}
