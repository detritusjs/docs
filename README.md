# detritus docs

The documentation website for `detritus-client`, `detritus-client-rest`, `detritus-client-socket`, `detritus-rest` and `detritus-utils`. The docs pages take their inspiration from [notsobot.com](https://notsobot.com/docs/tags).

It's a static site. Each package page opens with a hand-written guide (`content/<package>.md`), followed by an API reference generated from the TypeScript source with TypeDoc.

## Building

The docs folder sits next to the package checkouts:

```
detritusjs/
  client/  client-rest/  client-socket/  rest/  utils/
  docs/    <- this folder
```

```bash
cd docs
npm install          # optional, `extract` falls back to the typedoc installed in ../client
npm run docs         # extract + build
npm run serve        # http://localhost:4173
```

- `npm run extract` runs TypeDoc over each package's `src/index.ts` and writes `data/<package>.json`. Pass package names to only extract some: `node scripts/extract.mjs client rest`.
- `npm run build` turns `data/` and `content/` into `dist/`. It takes under a second, so re-run it after editing a guide.

Set `DOCS_BASE` when hosting under a sub path, like GitHub Pages for a project repo:

```bash
DOCS_BASE=/docs/ npm run build
```

`dist/` is plain HTML, CSS and JS with no server requirements. A `404.html` and `.nojekyll` are included for GitHub Pages.

## Deploying

`.github/workflows/deploy.yml` builds the site and deploys it to GitHub Pages. It clones the five package repos next to this one, installs their dependencies, runs `npm run docs` and publishes `dist/`. It runs:

- on every push to `master`
- every day at 06:00 UTC, so code pushed to the packages shows up within a day
- by hand, from the Actions tab ("Run workflow")
- when a package repo sends a `package-updated` dispatch (see below)

Setup, once:

1. In this repo's **Settings → Pages**, set the source to **GitHub Actions**.
2. The branches it documents are set at the top of the workflow (`CLIENT_REF`, `REST_REF`, ...). Keep them on the branches you publish from.
3. The site is served under `/<repo name>/` by default. With a custom domain like `detritusjs.com`, add it in Settings → Pages and set a repository variable `DOCS_BASE` to `/`.

To rebuild right after a package changes, add a step like this to that package's own workflow. It needs a fine-grained token with Contents write access to this repo, stored as a secret:

```yaml
- run: |
    curl -X POST -H "Authorization: Bearer ${{ secrets.DOCS_DISPATCH_TOKEN }}" \
      -H "Accept: application/vnd.github+json" \
      https://api.github.com/repos/detritusjs/docs/dispatches \
      -d '{"event_type": "package-updated"}'
```

## Layout

| Path | What it is |
| --- | --- |
| `content/<package>.md` | The guide for each package. The text before the first `##` is the page description; every `##` becomes a card and a sidebar entry. Inline code like `` `ShardClient` `` or `` `Structures.Message` `` links to the reference automatically. |
| `content/summaries.json` | One-line descriptions for symbols that have no doc comment in the source. Doc comments win when they exist. |
| `scripts/packages.mjs` | The list of packages, their npm names, repos and landing page blurbs. |
| `scripts/extract.mjs` | Runs TypeDoc. |
| `scripts/build.mjs` | Renders every page and the search index. |
| `scripts/lib/` | The markdown renderer, syntax highlighter, TypeDoc type renderer and page chrome. |
| `assets/` | `style.css` (a Discord-style dark palette) and `app.js` (search, copy buttons, member toggles, scroll spy). |

## Reference pages

- Every namespace, class and interface gets its own page. Enums, functions, type aliases and variables are shown inline on their namespace's page.
- Class pages hide internal members (names starting with `_`, and `protected` ones) by default, and can hide inherited ones. The toggles are remembered per browser.
- Constants whose value TypeDoc can't print, like `Endpoints.Routes`, get a "Show definition" expander with the source.
- Types link across packages, so a `detritus-client` method returning a `detritus-client-rest` type links to that page.
