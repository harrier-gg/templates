// Converts a Pterodactyl/Pelican egg into a Harrier template (ADR 0022). Eggs do not say which
// ports a game uses or what a backup may leave out, so those come as options:
//
//   node scripts/import-egg.mjs <egg.json | https://…> --id valheim/vanilla --game Valheim --variant Vanilla \
//     --port game=2456/udp --port query=2457/udp --players a2s:query --memory 4096 \
//     --exclude steamcmd,steamapps,linux64 --source <url of the egg, for NOTICE>
//
// Writes <id>/template.yaml and <id>/install.sh. Re-importing overwrites both.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { stringify } from 'yaml';

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: 'string' },
    game: { type: 'string' },
    variant: { type: 'string' },
    port: { type: 'string', multiple: true, default: [] },
    players: { type: 'string' },
    memory: { type: 'string', default: '2048' },
    exclude: { type: 'string', default: '' },
    source: { type: 'string' },
  },
});
const [input] = positionals;
if (!input || !opt.id || !opt.game || !opt.variant || !opt.port.length) {
  console.error('Usage: import-egg.mjs <egg.json|url> --id <game>/<variant> --game <name> --variant <name> --port name=port/proto …');
  process.exit(2);
}
const egg = JSON.parse(input.startsWith('https://') ? await (await fetch(input)).text() : readFileSync(input, 'utf8'));

/** Laravel validation rules (`required|string|min:5|max:20`) as a map. */
const rulesOf = (rules) =>
  Object.fromEntries(
    String(rules)
      .split('|')
      .filter(Boolean)
      .map((r) => {
        const i = r.indexOf(':');
        return i < 0 ? [r, true] : [r.slice(0, i), r.slice(i + 1)];
      }),
  );
const camel = (env) => env.toLowerCase().replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const config = [];
const env = {};
for (const v of egg.variables) {
  // Not editable: part of the game's setup, not a setting.
  if (!v.user_editable) {
    env[v.env_variable] = v.default_value ?? '';
    continue;
  }
  const rules = rulesOf(v.rules);
  const field = { key: camel(v.env_variable), label: { en: v.name } };
  if (rules.boolean) {
    Object.assign(field, { type: 'boolean', default: v.default_value === '1' || v.default_value === 'true', values: { on: '1', off: '0' } });
  } else if (rules.numeric || rules.integer) {
    Object.assign(field, { type: 'integer', default: Number(v.default_value || 0) });
    if (rules.min !== undefined) field.min = Number(rules.min);
    if (rules.max !== undefined) field.max = Number(rules.max);
  } else {
    const min = rules.min !== undefined ? Number(rules.min) : rules.required ? 1 : 0;
    const max = rules.max !== undefined ? Number(rules.max) : '';
    const secret = /PASS|SECRET|TOKEN/.test(v.env_variable);
    // An egg's default password is public knowledge: secrets start empty, and the panel generates
    // a random one per server (ADR 0022).
    Object.assign(field, { type: secret ? 'secret' : 'string', default: secret ? '' : (v.default_value ?? '') });
    if (rules.in) field.pattern = `^(${rules.in.split(',').map(escape).join('|')})$`;
    else if (rules.regex) field.pattern = rules.regex.replace(/^\/(.*)\/[a-z]*$/, '$1');
    else if (min > 0 || max !== '') field.pattern = `^.{${min},${max}}$`;
  }
  field.env = v.env_variable;
  config.push(field);
}
config.push({ key: 'memory', label: { en: 'Memory (MB)', de: 'Arbeitsspeicher (MB)' }, type: 'integer', default: Number(opt.memory), min: 1024, max: 65536, limit: 'memory' });

const first = Number(opt.port[0].split('=')[1].split('/')[0]);
const ports = opt.port.map((p) => {
  const [name, rest] = p.split('=');
  const [port, protocol] = rest.split('/');
  return { name, container: Number(port), protocol: protocol ?? 'udp', offset: Number(port) - first, samePort: true };
});

const startup = JSON.parse(egg.config?.startup || '{}');
const done = [startup.done ?? []].flat().filter(Boolean);
const stop = egg.config?.stop === '^C' ? { signal: 'SIGINT' } : egg.config?.stop === '^^C' ? { signal: 'SIGTERM' } : { command: egg.config?.stop };
const [gameId, variantId] = opt.id.split('/');
const installation = egg.scripts.installation;

const template = {
  schemaVersion: 1,
  id: opt.id,
  game: { id: gameId, name: opt.game },
  variant: { id: variantId, name: opt.variant, description: { en: egg.description.split('\n')[0] } },
  install: { method: 'script', image: installation.container, entrypoint: installation.entrypoint },
  runtime: { image: Object.values(egg.docker_images)[0], mountPath: '/home/container', startup: egg.startup, env },
  ports,
  config,
  lifecycle: { ...(done.length ? { ready: done.map(escape).join('|') } : {}), stop, stopTimeoutSecs: 60 },
  capabilities: {
    ...(opt.players ? { players: { protocol: opt.players.split(':')[0], port: opt.players.split(':')[1] } } : {}),
    ...(opt.exclude ? { backup: { exclude: opt.exclude.split(',') } } : {}),
  },
};

const dir = join(import.meta.dirname, '..', opt.id);
mkdirSync(dir, { recursive: true });
const header = `# Imported from the Pterodactyl egg "${egg.name}"${opt.source ? ` (${opt.source})` : ''} with scripts/import-egg.mjs;\n# MIT licensed, see NOTICE. Install script: install.sh.\n`;
writeFileSync(join(dir, 'template.yaml'), header + stringify(template, { lineWidth: 0 }));
writeFileSync(join(dir, 'install.sh'), installation.script.replace(/\r\n/g, '\n'));
console.log(`${opt.id}: ${config.length} settings, ${ports.length} ports${egg.config?.files && egg.config.files !== '{}' ? ' (config file rules of the egg were not imported)' : ''}`);
