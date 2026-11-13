// Validates index.json against the panel's template schema (ADR 0021): by default the schema on
// the backend's main branch, or a file or URL given as the first argument.
import Ajv from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMA = 'https://raw.githubusercontent.com/harrier-gg/backend/main/template.schema.json';
const source = process.argv[2] ?? SCHEMA;
const schema = source.startsWith('https://') ? await (await fetch(source)).json() : JSON.parse(readFileSync(source, 'utf8'));
const { templates } = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'index.json'), 'utf8'));

const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
const ids = new Set(templates.map((t) => t.id));
let failed = 0;
for (const template of templates) {
  const problems = validate(template) ? [] : validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`);
  if (template.extends && !ids.has(template.extends)) problems.push(`extends "${template.extends}", which does not exist`);
  if (problems.length) {
    failed++;
    console.error(`✗ ${template.id}\n  ${problems.join('\n  ')}`);
  } else console.log(`✓ ${template.id}`);
}
if (ids.size !== templates.length) {
  failed++;
  console.error('✗ ids are not unique');
}
process.exit(failed ? 1 : 0);
