import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { globalInstall } from '../src/install-global.mjs';
import { globalUninstall } from '../src/uninstall-global.mjs';

const LABELS = {
  create: 'CREATE',
  append: 'UPDATE',
  remove: 'REMOVE',
  'remove-managed-block': 'UPDATE',
  unchanged: 'OK',
  absent: 'ABSENT',
  preserve: 'PRESERVE',
  conflict: 'CONFLICT',
};

export async function runGlobalAction(action, {
  home, shell, pathEnv, skipShell = false, yes = false,
  confirm, log = console.log,
} = {}) {
  if (!['setup','uninstall'].includes(action)) {
    throw new Error('Usage: npm run setup | npm run uninstall');
  }
  const task = action === 'setup' ? globalInstall : globalUninstall;
  const options = { ...(home ? {home} : {}), ...(shell ? {shell} : {}),
    ...(pathEnv !== undefined ? {pathEnv} : {}), skipShell };
  const preview = task(options, () => {});
  log(action === 'setup' ? 'DevFlow global installation preview:' : 'DevFlow global removal preview:');
  for (const item of preview.files) {
    log('  ' + (LABELS[item.action] ?? item.action.toUpperCase()).padEnd(8) + ' ' + item.path +
      (item.reason ? ' — ' + item.reason : ''));
  }
  if (!preview.ok) {
    log('Cannot continue: installation targets conflict with existing files. Resolve them manually; no changes were made.');
    return { applied: false, reason: 'conflict', preview };
  }
  const changes = preview.files.some(({action})=>['create','append','remove','remove-managed-block'].includes(action));
  if (!changes) {
    log(action === 'setup' ? 'DevFlow is already installed; nothing to change.' : 'No DevFlow-owned global installation remains.');
    return { applied:false, reason:'nothing-to-do', preview };
  }
  if (!yes) {
    let answer;
    if (confirm) {
      answer = await confirm(action);
    } else if (!stdin.isTTY || !stdout.isTTY) {
      log('No interactive terminal detected. Nothing changed. Run in a terminal to confirm, or explicitly pass --yes (npm run ' + action + ' -- --yes).');
      return {applied:false,reason:'confirmation-required',preview};
    } else {
      const rl = createInterface({input:stdin,output:stdout});
      try {
        answer = await rl.question(
          action === 'setup' ? 'Install DevFlow globally? [y/N] ' : 'Uninstall DevFlow globally? [y/N] '
        );
      } finally {
        rl.close();
      }
    }
    if (typeof answer === 'string' ? !/^(y|yes|s|sim)$/i.test(answer.trim()) : answer !== true) {
      log('Cancelled. No changes were made.');
      return {applied:false,reason:'cancelled',preview};
    }
  }

  const result = task({...options,apply:true},()=>{});
  log(result.message);
  return {applied:true,preview,result};
}

export function parseActionArgs(argv) {
  const [action,...args] = argv;
  if (!['setup','uninstall'].includes(action)) {
    throw new Error('Usage: node scripts/global-action.mjs setup|uninstall [--yes] [--skip-shell]');
  }
  const options = {};
  for (const arg of args) {
    if (arg === '--yes') options.yes=true;
    else if (arg === '--skip-shell') options.skipShell=true;
    else throw new Error('Unknown option: '+arg);
  }
  return {action,options};
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  try {
    const {action,options} = parseActionArgs(process.argv.slice(2));
    const result=await runGlobalAction(action,options);
    if (result.reason==='conflict' || result.reason==='confirmation-required') process.exitCode=1;
  } catch(error) {
    console.error('devflow: '+error.message);
    process.exitCode=1;
  }
}
