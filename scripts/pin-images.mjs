// Pins every image in the templates to the digest its tag points to now, so an image can't be
// swapped under a published template. Images are written as `name:tag@sha256:…`: Docker pulls the
// digest, and the tag says what to pin again on the next run.
//
//   node scripts/pin-images.mjs           pin all images to their tag's current digest
//   node scripts/pin-images.mjs --check   fail if an image is not pinned (no network)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';

const root = join(import.meta.dirname, '..');
const check = process.argv.includes('--check');

function templateFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'scripts') return [];
    const path = join(dir, e.name);
    return e.isDirectory() ? templateFiles(path) : e.name === 'template.yaml' ? [path] : [];
  });
}

function images(template) {
  const { runtime = {}, install = {} } = template;
  return [runtime.image, ...Object.values(runtime.java ?? {}), install.image].filter(Boolean);
}

/** `ghcr.io/a/b:tag@sha256:…` → registry, repository and tag. Docker Hub names get its defaults. */
function parseRef(ref) {
  const name = ref.split('@')[0];
  const colon = name.lastIndexOf(':');
  const tag = colon > name.lastIndexOf('/') ? name.slice(colon + 1) : 'latest';
  const repo = colon > name.lastIndexOf('/') ? name.slice(0, colon) : name;
  const [first, ...rest] = repo.split('/');
  if (rest.length && (first.includes('.') || first.includes(':') || first === 'localhost')) {
    return { registry: first, repository: rest.join('/'), name: `${repo}:${tag}`, tag };
  }
  return { registry: 'registry-1.docker.io', repository: rest.length ? repo : `library/${repo}`, name: `${repo}:${tag}`, tag };
}

const ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

/** The digest a tag points to now (the multi-arch index if there is one), via an anonymous pull token. */
async function digest({ registry, repository, tag }) {
  const url = `https://${registry}/v2/${repository}/manifests/${tag}`;
  let res = await fetch(url, { method: 'HEAD', headers: { Accept: ACCEPT } });
  if (res.status === 401) {
    const params = Object.fromEntries([...(res.headers.get('www-authenticate') ?? '').matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
    const tokenUrl = new URL(params.realm);
    if (params.service) tokenUrl.searchParams.set('service', params.service);
    tokenUrl.searchParams.set('scope', `repository:${repository}:pull`);
    const { token, access_token } = await (await fetch(tokenUrl)).json();
    res = await fetch(url, { method: 'HEAD', headers: { Accept: ACCEPT, Authorization: `Bearer ${token ?? access_token}` } });
  }
  const found = res.headers.get('docker-content-digest');
  if (!res.ok || !found?.startsWith('sha256:')) throw new Error(`${registry}/${repository}:${tag}: ${res.status} ${res.statusText}`);
  return found;
}

let failed = 0;
const pinned = new Map();
for (const file of templateFiles(root)) {
  let text = readFileSync(file, 'utf8');
  for (const ref of new Set(images(parse(text)))) {
    if (check) {
      if (!/@sha256:[0-9a-f]{64}$/.test(ref)) {
        failed++;
        console.error(`✗ ${relative(root, file)}: ${ref} is not pinned (run \`npm run pin\`)`);
      }
      continue;
    }
    const parsed = parseRef(ref);
    if (!pinned.has(parsed.name)) pinned.set(parsed.name, `${parsed.name}@${await digest(parsed)}`);
    const next = pinned.get(parsed.name);
    if (next !== ref) {
      // Whole references only, so `:java1` never matches inside `:java16`.
      const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(`${escaped}(?![\\w.:@-])`, 'g'), next);
      console.log(`${relative(root, file)}: ${next}`);
    }
  }
  if (!check) writeFileSync(file, text);
}
if (check && !failed) console.log('✓ every image is pinned');
process.exit(failed ? 1 : 0);
