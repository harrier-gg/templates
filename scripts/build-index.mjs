// Builds index.json, the file panels load (ADR 0021): every template.yaml as JSON, sorted by id.
// `extends` stays as written; the panel resolves it. A template installed by script may keep the
// script next to it as install.sh instead of inline.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';

const root = join(import.meta.dirname, '..');
const files = readdirSync(root, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('template.yaml') && !f.startsWith('node_modules'));

const templates = files
  .map((file) => {
    const template = parse(readFileSync(join(root, file), 'utf8'));
    const folder = dirname(file).split('\\').join('/');
    if (template.id !== folder) throw new Error(`${file}: the id must be its folder, "${folder}"`);
    const script = join(root, folder, 'install.sh');
    if (template.install?.method === 'script' && !template.install.script && existsSync(script)) {
      template.install.script = readFileSync(script, 'utf8');
    }
    return template;
  })
  .sort((a, b) => a.id.localeCompare(b.id));

writeFileSync(join(root, 'index.json'), `${JSON.stringify({ templates }, null, 2)}\n`);
console.log(`index.json: ${templates.length} templates`);
