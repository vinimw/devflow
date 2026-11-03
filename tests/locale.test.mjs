import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(path) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}
test('the DevFlow skill defaults to Portuguese for user-facing responses', () => {
  const skill = source('skills/devflow/SKILL.md');
  assert.match(skill, /Default to Brazilian Portuguese/);
  assert.match(skill, /development\.response_locale/);
  assert.match(skill, /development\.ui_locale/);
  assert.match(skill, /explicit request from the user/);
});
test('a newly configured project separates agent response from app UI locale', () => {
  const template = source('templates/project/devflow.yaml');
  assert.match(template, /response_locale: pt-BR/);
  assert.match(template, /ui_locale: pt-BR/);
  assert.match(template, /code_language: en/);
});
test('both agent bootstraps honor Brazilian Portuguese before installation', () => {
  assert.match(source('AGENTS.md'), /Brazilian Portuguese/);
  assert.match(source('CLAUDE.md'), /Portuguese \(Brazil/);
});
test('global setup and uninstall prompts are in Portuguese', () => {
  const script = source('scripts/global-action.mjs');
  assert.match(script, /Instalar o DevFlow globalmente\?/);
  assert.match(script, /Desinstalar o DevFlow globalmente\?/);
  assert.match(script, /Terminal interativo não detectado/);
});
test('global install and uninstall completion messages are in Portuguese', () => {
  assert.match(source('src/install-global.mjs'), /DevFlow instalado globalmente/);
  assert.match(source('src/uninstall-global.mjs'), /Os componentes globais identificados/);
});
