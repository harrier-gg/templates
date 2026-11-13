# Harrier templates

The official game templates of [Harrier](https://github.com/harrier-gg): one folder per template,
named after its id. Panels load the generated [`index.json`](index.json) from this repository's
`main` branch (ADR 0021), so a new or fixed game reaches panels without a panel release.

```
minecraft-java/template.yaml            abstract base (Minecraft: Java Edition)
minecraft-java/paper/template.yaml      a variant: only what differs from the base
<game>/<variant>/install.sh             optional: the install script of a script install (ADR 0022)
```

The format is defined by the panel and described in
[`template.schema.json`](https://github.com/harrier-gg/backend/blob/main/template.schema.json);
see ADR 0005 (games, variants, providers) and ADR 0022 (script installs and Pterodactyl eggs) in
[harrier-gg/.github](https://github.com/harrier-gg/.github/tree/main/adr).

## Working on templates

```sh
npm ci
npm run index      # rebuild index.json after changing a template (commit it)
npm run validate   # check every template against the panel's schema
```

To try a template in a local panel, start the backend with
`HARRIER_TEMPLATES_URL=file:///path/to/templates/index.json`.

## Importing Pterodactyl eggs

Many games already have a [Pterodactyl or Pelican egg](https://github.com/pelican-eggs) (MIT).
`scripts/import-egg.mjs` converts one into a template with a script install (ADR 0022):

```sh
node scripts/import-egg.mjs <egg.json | https://…> --id valheim/vanilla --game Valheim --variant Vanilla \
  --port game=2456/udp --port query=2457/udp --players a2s:query --memory 4096 \
  --exclude steamcmd,steamapps,linux64 --source <url of the egg>
```

It writes `<id>/template.yaml` and `<id>/install.sh`. Review the result before committing:
egg variables become settings (passwords become secrets the panel generates per server), the
egg's `done` text becomes the ready pattern, and its stop command becomes a signal or a command.
Add the egg's source to [`NOTICE`](NOTICE).
