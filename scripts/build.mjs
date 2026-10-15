// Builds the static site into `dist/` from the TypeDoc JSON in `data/` and the guides in `content/`.
//   DOCS_BASE=/detritus/ node scripts/build.mjs   (for hosting under a sub path, defaults to `/`)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { escapeHtml } from './lib/highlight.mjs';
import { docsBody, docsHero, icon, page, LINKS, LOGO } from './lib/layout.mjs';
import { codeBlock, inline, markdown, slugify, ICON_COPY, LANG_TABS } from './lib/markdown.mjs';
import { anchorId, DocsModel, isInternalName, Kind, KIND_LABEL } from './lib/model.mjs';
import { firstSentence, renderComment, stripTags, TypeRenderer } from './lib/types.mjs';
import { PACKAGES } from './packages.mjs';


const DOCS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(DOCS_ROOT, '..');
const OUT = path.join(DOCS_ROOT, 'dist');
let BASE = process.env.DOCS_BASE || '/';
if (!BASE.endsWith('/')) {
  BASE += '/';
}

const started = Date.now();
const model = new DocsModel({dataDir: path.join(DOCS_ROOT, 'data'), packages: PACKAGES, base: BASE});
const packages = model.packages;

fs.rmSync(OUT, {recursive: true, force: true});
fs.mkdirSync(path.join(OUT, 'assets'), {recursive: true});
for (const file of fs.readdirSync(path.join(DOCS_ROOT, 'assets'))) {
  fs.copyFileSync(path.join(DOCS_ROOT, 'assets', file), path.join(OUT, 'assets', file));
}
fs.writeFileSync(path.join(OUT, 'assets', 'favicon.svg'), LOGO.replace('class="logo-mark" ', 'xmlns="http://www.w3.org/2000/svg" '));

const SUMMARIES = JSON.parse(fs.readFileSync(path.join(DOCS_ROOT, 'content', 'summaries.json'), 'utf8'));

// the first sentence of a doc comment, or a hand written fallback from content/summaries.json
function summaryText(node) {
  const fromComment = firstSentence(commentOf(node));
  if (fromComment) {
    return fromComment;
  }
  const table = SUMMARIES[node.__pkg.slug] || {};
  return (node.__path && table[node.__path.join('.')]) || '';
}

function proseLinks(pkg) {
  return {resolveLink: (code) => {
    const found = model.resolveName(code, pkg);
    return found ? model.url(found) : null;
  }};
}

let pageCount = 0;
function writePage(relative, html) {
  const file = path.join(OUT, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, html);
  pageCount++;
}


// ---------------------------------------------------------------- helpers

const KIND_GROUPS = [
  {kind: Kind.Namespace, id: 'namespaces', title: 'Namespaces', blurb: 'Grouped exports, reached as properties of the package.'},
  {kind: Kind.Class, id: 'classes', title: 'Classes', blurb: 'Classes you create or receive from the library.'},
  {kind: Kind.Interface, id: 'interfaces', title: 'Interfaces', blurb: 'Object shapes for options, payloads and events.'},
  {kind: Kind.Enum, id: 'enums', title: 'Enums', blurb: 'Named constants.'},
  {kind: Kind.Function, id: 'functions', title: 'Functions', blurb: 'Standalone helpers.'},
  {kind: Kind.TypeAlias, id: 'types', title: 'Type aliases', blurb: 'Named types used across the API.'},
  {kind: Kind.Variable, id: 'variables', title: 'Variables', blurb: 'Exported values.'},
];

function kindBadge(kind, extra = '') {
  const label = KIND_LABEL[kind] || 'item';
  return `<span class="kind kind-${label.replace(' ', '-')}${extra}">${label}</span>`;
}

function anchorLink(id) {
  return `<a class="anchor" href="#${id}" aria-label="Link to this section">${icon('link')}</a>`;
}

// the file's path inside its repository, taken from the GitHub url TypeDoc generated (its fileName is relative to whatever it guessed the base was)
function repoPath(source) {
  const match = source.url && source.url.match(/\/blob\/[^/]+\/([^#]+)/);
  return match ? decodeURIComponent(match[1]) : source.fileName;
}

function sourceLink(node) {
  const source = node && node.sources && node.sources[0];
  if (!source || !source.url) {
    return '';
  }
  const file = repoPath(source);
  return `<a class="source-link" href="${escapeHtml(source.url)}" target="_blank" rel="noopener" title="View source on GitHub">${icon('file-code')}${escapeHtml(file)}:${source.line}</a>`;
}

function commentOf(node) {
  if (!node) {
    return null;
  }
  if (node.comment) {
    return node.comment;
  }
  for (const key of ['signatures', 'getSignature', 'setSignature']) {
    const value = node[key];
    const signature = Array.isArray(value) ? value[0] : value;
    if (signature && signature.comment) {
      return signature.comment;
    }
  }
  return null;
}

function isDeprecated(node) {
  const comment = commentOf(node);
  return !!(comment && (comment.blockTags || []).some((tag) => tag.tag === '@deprecated'));
}

function memberClasses(node) {
  const classes = [];
  if (node.inheritedFrom) {
    classes.push('is-inherited');
  }
  if (isInternalName(node.name) || (node.flags && node.flags.isProtected)) {
    classes.push('is-internal');
  }
  return classes.join(' ');
}

function flagBadges(node, extra = []) {
  const flags = node.flags || {};
  const out = [...extra];
  if (flags.isStatic) out.push('static');
  if (flags.isAbstract) out.push('abstract');
  if (flags.isProtected) out.push('protected');
  if (flags.isReadonly) out.push('readonly');
  if (flags.isConst && node.kind === Kind.Variable) out.push('const');
  if (flags.isOptional) out.push('optional');
  const signature = node.signatures && node.signatures[0];
  if (signature && signature.type && signature.type.type === 'reference' && signature.type.name === 'Promise') out.push('async');
  let html = out.map((flag) => `<span class="flag">${flag}</span>`).join('');
  if (isDeprecated(node)) {
    html += '<span class="flag warn">deprecated</span>';
  }
  return html ? `<span class="flags">${html}</span>` : '';
}

function relationNote(node, renderer) {
  const notes = [];
  for (const [key, label] of [['inheritedFrom', 'Inherited from'], ['overwrites', 'Overrides'], ['implementationOf', 'Implements']]) {
    const ref = node[key];
    if (!ref) {
      continue;
    }
    const target = model.resolveTarget(ref.target, renderer.pkg);
    const text = escapeHtml(ref.name || '');
    const href = target ? model.url(target) : null;
    notes.push(`${label} ${href ? `<a href="${href}">${text}</a>` : `<span>${text}</span>`}`);
  }
  return notes.length ? `<div class="from">${notes.join(' · ')}</div>` : '';
}

// for constants whose value TypeDoc can't print (`...`), show the definition straight from the source file
const sourceCache = new Map();
function sourceExcerpt(node, pkg) {
  const source = node.sources && node.sources[0];
  if (!source) {
    return null;
  }
  const candidates = [
    path.join(REPO_ROOT, pkg.dir, repoPath(source)),
    path.join(REPO_ROOT, pkg.dir, source.fileName),
  ];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) {
    return null;
  }
  if (!sourceCache.has(file)) {
    sourceCache.set(file, fs.readFileSync(file, 'utf8').split('\n'));
  }
  const lines = sourceCache.get(file);
  const start = source.line - 1;
  let depth = 0;
  let seenOpen = false;
  const out = [];
  for (let i = start; i < lines.length && out.length < 800; i++) {
    const line = lines[i];
    out.push(line);
    const stripped = line.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '').replace(/\/\/.*$/, '');
    for (const char of stripped) {
      if (char === '{' || char === '[' || char === '(') {
        depth++;
        seenOpen = true;
      } else if (char === '}' || char === ']' || char === ')') {
        depth--;
      }
    }
    if ((seenOpen && depth <= 0) || (!seenOpen && /;\s*$/.test(line))) {
      break;
    }
  }
  if (out.length < 2) {
    return null;
  }
  const indent = Math.min(...out.filter((line) => line.trim()).map((line) => line.match(/^\s*/)[0].length));
  return out.map((line) => line.slice(indent)).join('\n');
}

function importSnippet(node, pkg) {
  const chain = [];
  let current = node;
  while (current && current.kind !== Kind.Project) {
    chain.unshift(current.name);
    current = current.__parent;
  }
  if (!chain.length) {
    return '';
  }
  const head = chain[0];
  const access = chain.join('.');
  const lines = [`import { ${head} } from '${pkg.npm}';`];
  if (chain.length > 1) {
    lines.push('', `${access};`);
  }
  return codeBlock(lines.join('\n'), 'ts');
}

function countMembers(node) {
  const counts = {methods: 0, properties: 0};
  for (const child of node.children || []) {
    if (child.inheritedFrom || isInternalName(child.name)) {
      continue;
    }
    if (child.kind === Kind.Method) counts.methods++;
    if (child.kind === Kind.Property || child.kind === Kind.Accessor) counts.properties++;
  }
  return counts;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function describeContainer(node) {
  const counts = {};
  for (const child of node.children || []) {
    const label = KIND_GROUPS.find((group) => group.kind === child.kind);
    if (label) {
      counts[label.title] = (counts[label.title] || 0) + 1;
    }
  }
  return Object.entries(counts).map(([title, count]) => `${count} ${title.toLowerCase()}`).join(' · ');
}

function breadcrumb(node, pkg) {
  const parts = [];
  let current = node.__parent;
  while (current) {
    const label = current.kind === Kind.Project ? pkg.npm : current.name;
    parts.unshift(`<a href="${model.url(current)}">${escapeHtml(label)}</a>`);
    current = current.__parent;
  }
  return `${icon('book-open')}<a href="${BASE}">Documentation</a><span class="sep">/</span>${parts.join('<span class="sep">/</span>')}`;
}

function sideLink(href, label, {count, mono = false, classes = '', title} = {}) {
  return `<li${classes ? ` class="${classes}"` : ''}><a class="side-link" href="${href}"${title ? ` title="${escapeHtml(title)}"` : ''}><span class="label${mono ? ' mono' : ''}">${label}</span>${count !== undefined ? `<span class="count">${count}</span>` : ''}</a></li>`;
}

function mobileToc(links) {
  if (!links.length) {
    return '';
  }
  return `<details class="mobile-toc"><summary>On this page ${icon('chevron-down')}</summary><div class="toc-body"><ul class="side-list">${links.join('')}</ul></div></details>`;
}


// ---------------------------------------------------------------- member rendering

function propertyRow(node, renderer) {
  const id = node.__anchor;
  const optional = node.flags && node.flags.isOptional ? '<span class="opt">?</span>' : '';
  let typeHtml;
  let extraFlags = [];
  if (node.kind === Kind.Accessor) {
    const getter = node.getSignature;
    const setter = node.setSignature;
    typeHtml = getter ? renderer.type(getter.type) : renderer.type(setter && setter.parameters && setter.parameters[0] && setter.parameters[0].type);
    extraFlags = [getter && setter ? 'get · set' : (getter ? 'get' : 'set')];
  } else if (node.kind === Kind.EnumMember) {
    typeHtml = renderer.type(node.type);
  } else {
    typeHtml = renderer.type(node.type);
  }
  const comment = renderComment(commentOf(node), renderer);
  const defaultValue = (node.defaultValue && node.defaultValue !== '...' && node.kind !== Kind.EnumMember)
    ? `<div class="meta-line">Default <span class="value">${escapeHtml(node.defaultValue.length > 160 ? node.defaultValue.slice(0, 160) + '…' : node.defaultValue)}</span></div>`
    : '';
  return `<div class="row ${memberClasses(node)}" id="${id}">
  <div class="row-name"><span>${escapeHtml(node.name)}${optional}</span>${anchorLink(id)}</div>
  <div class="row-body">
    <div class="type-inline">${typeHtml}</div>
    ${flagBadges(node, extraFlags) ? `<div class="row-flags">${flagBadges(node, extraFlags)}</div>` : ''}
    ${comment ? `<div class="prose">${comment}</div>` : ''}
    ${defaultValue}
    ${relationNote(node, renderer)}
  </div>
</div>`;
}

// expands `options: {a, b}` style parameters into `options.a`, `options.b` rows
function parameterRows(signature, renderer) {
  const rows = [];
  for (const parameter of signature.parameters || []) {
    const name = /^__\d*$/.test(parameter.name) ? 'options' : parameter.name;
    const optional = (parameter.flags && parameter.flags.isOptional) || parameter.defaultValue !== undefined;
    const comment = renderComment(parameter.comment, renderer);
    const def = parameter.defaultValue !== undefined && parameter.defaultValue !== '...' && parameter.defaultValue !== '{}'
      ? `<div class="meta-line">Default <span class="value">${escapeHtml(parameter.defaultValue)}</span></div>`
      : '';
    rows.push({name: `${name}${optional ? '<span class="opt">?</span>' : ''}`, type: renderer.type(parameter.type), comment, def});
    const declaration = parameter.type && parameter.type.type === 'reflection' && parameter.type.declaration;
    if (declaration && declaration.children && declaration.children.length) {
      for (const child of declaration.children) {
        const childOptional = child.flags && child.flags.isOptional;
        rows.push({
          name: `${name}.${escapeHtml(child.name)}${childOptional ? '<span class="opt">?</span>' : ''}`,
          type: renderer.type(child.type),
          comment: renderComment(child.comment, renderer),
          def: '',
        });
      }
    }
  }
  return rows;
}

function signatureBlock(name, signature, renderer, options = {}) {
  const html = renderer.signature(name, signature, options);
  const plain = stripTags(html);
  const comment = renderComment(signature.comment, renderer);
  const rows = parameterRows(signature, renderer);
  const showParams = rows.some((row) => row.comment || row.def) || rows.length > (signature.parameters || []).length;
  const returnsTag = signature.comment && (signature.comment.blockTags || []).find((tag) => tag.tag === '@returns');
  let out = `<div class="code-block sig"><pre><code>${html}</code></pre><button type="button" class="copy-btn" aria-label="Copy signature" data-copy="${escapeHtml(plain)}">${ICON_COPY}</button></div>`;
  if (comment) {
    out += `<div class="prose">${comment}</div>`;
  }
  if (showParams) {
    out += `<div><h4 class="section-label sub-label">Parameters</h4><div class="params">${rows.map((row) => `<div class="param"><div class="param-name">${row.name}</div><div class="param-body"><div class="type-inline">${row.type}</div>${row.comment ? `<div class="prose">${row.comment}</div>` : ''}${row.def}</div></div>`).join('')}</div></div>`;
  }
  if (returnsTag) {
    const text = returnsTag.content.map((part) => part.text).join('');
    out += `<div><h4 class="section-label sub-label">Returns</h4><div class="returns"><div class="type-inline">${renderer.type(signature.type)}</div><div class="prose">${markdown(text)}</div></div></div>`;
  }
  return out;
}

function memberCard(node, renderer, {title, signatures, prefix = '', isConstructor = false} = {}) {
  const id = node.__anchor;
  const name = title || node.name;
  const sigs = signatures || node.signatures || [];
  const body = sigs.map((signature) => signatureBlock(isConstructor ? `new ${renderer.ownerName}` : name, signature, renderer, {prefix, isConstructor})).join('');
  const nodeComment = node.comment ? `<div class="prose">${renderComment(node.comment, renderer)}</div>` : '';
  return `<article class="card ${memberClasses(node)}" id="${id}">
  <header class="card-head">
    <h3 class="card-title mono"><span>${escapeHtml(name)}${isConstructor ? '' : '()'}</span>${anchorLink(id)}</h3>
    ${flagBadges(node)}
    ${sourceLink(node)}
  </header>
  <div class="member-body">${nodeComment}${body}${isConstructor ? '' : relationNote(node, renderer)}</div>
</article>`;
}

// enums, functions, variables and type aliases are shown inline on their namespace page
function inlineCard(node, renderer, pkg) {
  const id = node.__anchor;
  let body = '';
  let title = escapeHtml(node.name);
  const comment = renderComment(commentOf(node), renderer);
  if (node.kind === Kind.Enum) {
    const rows = (node.children || []).map((member) => {
      const value = member.type ? renderer.type(member.type) : '';
      return `<div class="row" id="${member.__anchor}"><div class="row-name"><span>${escapeHtml(member.name)}</span>${anchorLink(member.__anchor)}</div><div class="row-body"><div class="type-inline">${value}</div>${member.comment ? `<div class="prose">${renderComment(member.comment, renderer)}</div>` : ''}</div></div>`;
    }).join('');
    body = `${comment ? `<div class="prose">${comment}</div>` : ''}<div class="rows">${rows}</div>`;
  } else if (node.kind === Kind.Function) {
    body = (node.signatures || []).map((signature) => signatureBlock(node.name, signature, renderer, {prefix: '<span class="tk-k">function</span> '})).join('');
    title += '()';
  } else if (node.kind === Kind.TypeAlias) {
    const html = `<span class="tk-k">type</span> <span class="tk-t">${escapeHtml(node.name)}</span>${renderer.typeParameters(node.typeParameters)} <span class="tk-p">=</span> ${renderer.type(node.type)}`;
    body = `<div class="code-block sig"><pre><code>${html}</code></pre><button type="button" class="copy-btn" aria-label="Copy" data-copy="${escapeHtml(stripTags(html))}">${ICON_COPY}</button></div>${comment ? `<div class="prose">${comment}</div>` : ''}`;
  } else if (node.kind === Kind.Variable) {
    const keyword = node.flags && node.flags.isConst ? 'const' : 'let';
    let html = `<span class="tk-k">${keyword}</span> <span class="tk-v">${escapeHtml(node.name)}</span><span class="tk-p">:</span> ${renderer.type(node.type)}`;
    if (node.defaultValue && node.defaultValue !== '...') {
      const value = node.defaultValue.length > 300 ? node.defaultValue.slice(0, 300) + '…' : node.defaultValue;
      html += ` <span class="tk-p">=</span> <span class="tk-n">${escapeHtml(value)}</span>`;
    }
    body = `<div class="code-block sig"><pre><code>${html}</code></pre><button type="button" class="copy-btn" aria-label="Copy" data-copy="${escapeHtml(stripTags(html))}">${ICON_COPY}</button></div>${comment ? `<div class="prose">${comment}</div>` : ''}`;
    const declaration = node.type && node.type.type === 'reflection' && node.type.declaration;
    if (declaration && declaration.children && declaration.children.length) {
      const rows = declaration.children.map((child) => {
        const value = child.defaultValue && child.defaultValue !== '...' ? child.defaultValue : null;
        const type = child.type ? renderer.type(child.type) : (child.signatures ? renderer.functionType(child.signatures[0]) : '');
        return `<div class="row"><div class="row-name"><span>${escapeHtml(child.name)}</span></div><div class="row-body"><div class="type-inline">${value ? `<span class="value">${escapeHtml(value.length > 200 ? value.slice(0, 200) + '…' : value)}</span>` : type}</div></div></div>`;
      }).join('');
      body += `<details class="defn"><summary class="section-label">${plural(declaration.children.length, 'key')}</summary><div class="rows">${rows}</div></details>`;
    } else if (node.defaultValue === '...') {
      const excerpt = sourceExcerpt(node, pkg);
      if (excerpt) {
        body += `<details class="defn"><summary class="section-label">Show definition (${plural(excerpt.split('\n').length, 'line')})</summary>${codeBlock(excerpt, 'ts')}</details>`;
      }
    }
  }
  return `<article class="card" id="${id}">
  <header class="card-head">
    <h3 class="card-title mono"><span>${title}</span>${anchorLink(id)}</h3>
    ${kindBadge(node.kind)}
    ${flagBadges(node)}
    ${sourceLink(node)}
  </header>
  <div class="member-body">${body}</div>
</article>`;
}

function indexItem(node) {
  const desc = summaryText(node);
  let meta = '';
  if (node.kind === Kind.Class || node.kind === Kind.Interface) {
    const counts = countMembers(node);
    const parts = [];
    if (counts.properties) parts.push(plural(counts.properties, 'property').replace('propertys', 'properties'));
    if (counts.methods) parts.push(plural(counts.methods, 'method'));
    meta = parts.join(' · ');
  } else if (node.kind === Kind.Namespace) {
    meta = describeContainer(node);
  }
  return `<a class="index-item" href="${model.url(node)}">
  <span class="ii-name">${kindBadge(node.kind)}<span>${escapeHtml(node.name)}</span></span>
  ${desc ? `<span class="ii-desc">${escapeHtml(desc.replace(/`/g, ''))}</span>` : ''}
  ${meta ? `<span class="ii-meta">${meta}</span>` : ''}
</a>`;
}


// ---------------------------------------------------------------- container pages (package root and namespaces)

function referenceSections(node, renderer, pkg) {
  const sections = [];
  const toc = [];
  for (const group of KIND_GROUPS) {
    const items = (node.children || []).filter((child) => child.kind === group.kind);
    if (!items.length) {
      continue;
    }
    const sectionId = `ref-${group.id}`;
    const linked = group.kind === Kind.Namespace || group.kind === Kind.Class || group.kind === Kind.Interface;
    const inner = linked
      ? `<div class="index-grid">${items.map(indexItem).join('')}</div>`
      : `<div class="stack-list">${items.map((item) => inlineCard(item, renderer, pkg)).join('')}</div>`;
    sections.push(`<section class="ref-section" id="${sectionId}">
  <header><h2>${group.title}</h2><p>${group.blurb}</p></header>
  ${inner}
</section>`);
    toc.push({group, items, sectionId, linked});
  }
  return {sections, toc};
}

function renderContainerPage(node, pkg, guide) {
  const renderer = new TypeRenderer(model, pkg);
  const isRoot = node.kind === Kind.Project;
  const {sections, toc} = referenceSections(node, renderer, pkg);

  let content = '';
  const side = [];
  const mobile = [];

  if (isRoot && guide.sections.length) {
    content += guide.sections.map((section) => `<section class="card guide-card" id="${section.id}">
  <h2 class="card-title"><span>${escapeHtml(section.title)}</span>${anchorLink(section.id)}</h2>
  <div class="prose" style="margin-top:12px">${section.html}</div>
</section>`).join('\n');
    side.push(`<div class="side-group"><span class="section-label">Guide</span><ul class="side-list">${guide.sections.map((section) => sideLink(`#${section.id}`, escapeHtml(section.title))).join('')}</ul></div>`);
    mobile.push(...guide.sections.map((section) => sideLink(`#${section.id}`, escapeHtml(section.title))));
  }

  if (!isRoot) {
    const comment = renderComment(node.comment, renderer);
    content += `<section class="card"><div class="member-body">${comment ? `<div class="prose">${comment}</div>` : ''}${importSnippet(node, pkg)}<div class="meta-line">${describeContainer(node)}</div></div></section>`;
  }

  content += sections.join('\n');

  const refLinks = toc.map(({group, items, sectionId}) => sideLink(`#${sectionId}`, group.title, {count: items.length}));
  side.push(`<div class="side-group"><span class="section-label">Reference</span><ul class="side-list">${refLinks.join('')}</ul></div>`);
  mobile.push(...refLinks);

  // namespaces get their own listing, plus every inline item on namespace pages
  const namespaces = (node.children || []).filter((child) => child.kind === Kind.Namespace);
  if (namespaces.length) {
    side.push(`<div class="side-group"><span class="section-label">Namespaces</span><ul class="side-list">${namespaces.map((ns) => sideLink(model.url(ns), escapeHtml(ns.name), {count: (ns.children || []).length})).join('')}</ul></div>`);
  }
  if (!isRoot) {
    for (const {group, items, linked} of toc) {
      if (group.kind === Kind.Namespace) {
        continue;
      }
      side.push(`<div class="side-group"><span class="section-label">${group.title}</span><ul class="side-list">${items.map((item) => sideLink(linked ? model.url(item) : `#${item.__anchor}`, escapeHtml(item.name), {mono: true, title: item.name})).join('')}</ul></div>`);
    }
  }

  let back = '';
  if (!isRoot) {
    const parent = node.__parent;
    back = `<a class="side-back" href="${model.url(parent)}">${icon('chevron-left')}${escapeHtml(parent.kind === Kind.Project ? pkg.npm : parent.name)}</a>`;
  }

  const meta = pkg.meta;
  const description = isRoot
    ? `<p>${inline(guide.description || meta.description || pkg.tagline)}</p><p class="meta-line"><span class="value">${escapeHtml(pkg.npm)}@${escapeHtml(meta.version)}</span> · ${escapeHtml(meta.license)} · <a href="https://github.com/${pkg.repo}" target="_blank" rel="noopener">github.com/${pkg.repo}</a></p>`
    : (summaryText(node) ? `<p>${inline(summaryText(node), proseLinks(pkg))}</p>` : `<p>The <code class="inline-code">${escapeHtml(node.__path.join('.'))}</code> namespace of ${escapeHtml(pkg.npm)}.</p>`);

  const hero = docsHero({
    base: BASE,
    packages,
    activeSlug: pkg.slug,
    eyebrow: isRoot ? `${icon('book-open')}<a href="${BASE}">Documentation</a>` : breadcrumb(node, pkg),
    title: isRoot ? pkg.title : node.name,
    titleHtml: isRoot ? escapeHtml(`Detritus ${pkg.title}`) : `<span class="mono">${escapeHtml(node.__path.join('.'))}</span>`,
    badges: isRoot ? '' : kindBadge(node.kind),
    description,
    langSwitch: isRoot && guide.sections.some((section) => section.html.includes('class="code-group"')),
  });

  const body = hero + docsBody({
    sidebar: back + side.join(''),
    content,
    mobileToc: mobileToc(mobile),
  });
  writePage(node.__page, page({
    base: BASE,
    title: isRoot ? pkg.npm : `${node.__path.join('.')} · ${pkg.npm}`,
    description: isRoot ? (meta.description || pkg.tagline) : `${node.__path.join('.')} namespace reference for ${pkg.npm}.`,
    body,
    active: pkg.slug,
    packages,
    searchPackage: pkg.slug,
  }));
}


// ---------------------------------------------------------------- class and interface pages

function hierarchy(node, renderer) {
  const chain = [];
  let current = node;
  const seen = new Set();
  while (current && current.extendedTypes && current.extendedTypes.length && !seen.has(current)) {
    seen.add(current);
    const ref = current.extendedTypes[0];
    chain.unshift(renderer.type(ref));
    current = ref.type === 'reference' ? model.resolveTarget(ref.target, renderer.pkg) : null;
  }
  if (!chain.length) {
    return '';
  }
  chain.push(`<span class="current">${escapeHtml(node.name)}</span>`);
  return `<div><h4 class="section-label sub-label">Hierarchy</h4><div class="hierarchy">${chain.join(`<span class="sep">${icon('chevron-right', 'size-3')}</span>`)}</div></div>`;
}

function typeList(label, types, renderer) {
  if (!types || !types.length) {
    return '';
  }
  return `<div><h4 class="section-label sub-label">${label}</h4><div class="type-inline">${types.map((type) => renderer.type(type)).join('<span class="tk-p">, </span>')}</div></div>`;
}

function renderObjectPage(node, pkg) {
  const renderer = new TypeRenderer(model, pkg);
  renderer.ownerName = node.name;
  const children = node.children || [];

  const groups = [
    {id: 'constructor', title: 'Constructor', items: children.filter((child) => child.kind === Kind.Constructor), card: true},
    {id: 'properties', title: 'Properties', items: children.filter((child) => child.kind === Kind.Property)},
    {id: 'accessors', title: 'Accessors', items: children.filter((child) => child.kind === Kind.Accessor)},
    {id: 'methods', title: 'Methods', items: children.filter((child) => child.kind === Kind.Method), card: true},
  ].filter((group) => group.items.length);
  for (const group of groups) {
    // statics first, keep TypeDoc's alphabetical order otherwise
    group.items.sort((a, b) => Number(!!(b.flags && b.flags.isStatic)) - Number(!!(a.flags && a.flags.isStatic)));
  }

  // overview card
  const overview = [];
  const comment = renderComment(node.comment, renderer);
  if (comment) {
    overview.push(`<div class="prose">${comment}</div>`);
  }
  overview.push(importSnippet(node, pkg));
  overview.push(hierarchy(node, renderer));
  if (node.typeParameters && node.typeParameters.length) {
    overview.push(`<div><h4 class="section-label sub-label">Type parameters</h4><div class="type-inline">${renderer.typeParameters(node.typeParameters)}</div></div>`);
  }
  overview.push(typeList('Implements', node.implementedTypes, renderer));
  overview.push(typeList(node.kind === Kind.Interface ? 'Extended by' : 'Subclasses', node.extendedBy, renderer));
  overview.push(typeList('Implemented by', node.implementedBy, renderer));
  for (const index of node.indexSignatures || []) {
    const parameter = (index.parameters || [])[0];
    overview.push(`<div><h4 class="section-label sub-label">Index signature</h4><div class="type-inline">[${escapeHtml(parameter ? parameter.name : 'key')}: ${renderer.type(parameter && parameter.type)}]: ${renderer.type(index.type)}</div></div>`);
  }
  for (const signature of node.signatures || []) {
    overview.push(`<div><h4 class="section-label sub-label">Call signature</h4><div class="code-block sig"><pre><code>${renderer.functionType(signature)}</code></pre></div></div>`);
  }
  const counts = countMembers(node);
  const totals = [];
  if (counts.properties) totals.push(plural(counts.properties, 'property').replace('propertys', 'properties'));
  if (counts.methods) totals.push(plural(counts.methods, 'method'));
  const inheritedCount = children.filter((child) => child.inheritedFrom).length;
  if (inheritedCount) totals.push(`${inheritedCount} inherited`);
  overview.push(`<div class="meta-line meta-row">${totals.map((total) => `<span>${total}</span>`).join('')}${sourceLink(node)}</div>`);

  let content = `<section class="card" id="overview"><div class="member-body">${overview.filter(Boolean).join('')}</div></section>`;

  for (const group of groups) {
    const inner = group.card
      ? `<div class="member-stack">${group.items.map((item) => memberCard(item, renderer, {isConstructor: group.id === 'constructor', title: group.id === 'constructor' ? `new ${node.name}` : undefined})).join('')}</div>`
      : `<div class="card"><div class="rows">${group.items.map((item) => propertyRow(item, renderer)).join('')}</div></div>`;
    content += `<section class="ref-section" id="section-${group.id}"><header><h2>${group.title}</h2></header>${inner}</section>`;
  }
  if (!groups.length) {
    content += '<p class="empty-note">This type has no documented members.</p>';
  }

  // sidebar
  const parent = node.__parent;
  const hasInherited = children.some((child) => child.inheritedFrom);
  const hasInternal = children.some((child) => isInternalName(child.name) || (child.flags && child.flags.isProtected));
  let sidebar = `<a class="side-back" href="${model.url(parent)}">${icon('chevron-left')}${escapeHtml(parent.kind === Kind.Project ? pkg.npm : parent.__path.join('.'))}</a>`;
  if (hasInherited || hasInternal) {
    sidebar += `<div class="toggles">${hasInherited ? '<label><input type="checkbox" data-toggle="inherited" checked> Show inherited</label>' : ''}${hasInternal ? '<label><input type="checkbox" data-toggle="internal"> Show internal</label>' : ''}</div>`;
  }
  sidebar += `<div class="side-group"><span class="section-label">${KIND_LABEL[node.kind]}</span><ul class="side-list">${sideLink('#overview', 'Overview')}</ul></div>`;
  for (const group of groups) {
    const links = group.items.map((item) => sideLink(`#${item.__anchor}`, escapeHtml(item.name) + (item.kind === Kind.Method ? '()' : ''), {mono: true, classes: memberClasses(item), title: item.name}));
    sidebar += `<div class="side-group"><span class="section-label">${group.title} · ${group.items.length}</span><ul class="side-list">${links.join('')}</ul></div>`;
  }
  const mobile = [sideLink('#overview', 'Overview'), ...groups.map((group) => sideLink(`#section-${group.id}`, group.title, {count: group.items.length}))];

  const typeParams = node.typeParameters && node.typeParameters.length
    ? `<span class="tk-p" style="font-weight:400">&lt;${node.typeParameters.map((param) => escapeHtml(param.name)).join(', ')}&gt;</span>`
    : '';
  const summary = summaryText(node);
  const hero = docsHero({
    base: BASE,
    packages,
    activeSlug: pkg.slug,
    eyebrow: breadcrumb(node, pkg),
    titleHtml: `<span class="mono">${escapeHtml(node.name)}${typeParams}</span>`,
    badges: kindBadge(node.kind) + (isDeprecated(node) ? '<span class="flag warn">deprecated</span>' : ''),
    description: summary
      ? `<p>${inline(summary, proseLinks(pkg))}</p>`
      : `<p>${KIND_LABEL[node.kind] === 'class' ? 'Class' : 'Interface'} <code class="inline-code">${escapeHtml(node.__path.join('.'))}</code> from ${escapeHtml(pkg.npm)}.</p>`,
  });

  writePage(node.__page, page({
    base: BASE,
    title: `${node.__path.join('.')} · ${pkg.npm}`,
    description: summary.replace(/`/g, '') || `${node.__path.join('.')} ${KIND_LABEL[node.kind]} reference for ${pkg.npm}.`,
    body: hero + docsBody({sidebar, content, mobileToc: mobileToc(mobile)}),
    active: pkg.slug,
    packages,
    searchPackage: pkg.slug,
  }));
}


// ---------------------------------------------------------------- guides

function loadGuide(pkg) {
  const file = path.join(DOCS_ROOT, 'content', `${pkg.slug}.md`);
  if (!fs.existsSync(file)) {
    return {description: '', sections: []};
  }
  const source = fs.readFileSync(file, 'utf8');
  const resolveLink = (code) => {
    const node = model.resolveName(code, pkg);
    return node ? model.url(node) : null;
  };
  // the paragraph before the first `## ` is the page description, every `## ` becomes a card
  const [intro, ...chunks] = source.split(/^## /m);
  const description = intro.replace(/^# .*$/m, '').trim();
  const sections = chunks.map((chunk) => {
    const newline = chunk.indexOf('\n');
    const title = chunk.slice(0, newline).trim();
    const id = `guide-${slugify(title)}`;
    const body = chunk.slice(newline + 1).replace(/\{\{base\}\}/g, BASE);
    return {title, id, html: markdown(body, {resolveLink, idPrefix: id, headingOffset: 0})};
  });
  return {description, sections};
}


// ---------------------------------------------------------------- search index

function buildSearchIndex() {
  const kinds = [];
  const kindIndex = (kind) => {
    const label = KIND_LABEL[kind] || 'item';
    let index = kinds.indexOf(label);
    if (index === -1) {
      kinds.push(label);
      index = kinds.length - 1;
    }
    return index;
  };
  // urls are split into a shared page list plus an anchor, most entries point into a handful of pages
  const pages = [];
  const pageIndex = new Map();
  const items = [];
  const push = (node, kind, parentLabel, pkgIndex) => {
    const [pagePath, anchor = ''] = node.__url.split('#');
    let index = pageIndex.get(pagePath);
    if (index === undefined) {
      index = pages.push(pagePath) - 1;
      pageIndex.set(pagePath, index);
    }
    items.push(anchor ? [node.name, kind, parentLabel, index, pkgIndex, anchor] : [node.name, kind, parentLabel, index, pkgIndex]);
  };
  packages.forEach((pkg, pkgIndex) => {
    const visit = (node) => {
      for (const child of node.children || []) {
        if (!child.__url) {
          continue;
        }
        const parentLabel = node.kind === Kind.Project ? '' : node.__path.join('.');
        const isContainer = node.kind === Kind.Project || node.kind === Kind.Namespace;
        if (isContainer || node.kind === Kind.Enum) {
          push(child, kindIndex(child.kind), parentLabel, pkgIndex);
        } else if (!child.inheritedFrom && !isInternalName(child.name) && child.kind !== Kind.Constructor) {
          push(child, kindIndex(child.kind), parentLabel, pkgIndex);
        }
        if (child.kind === Kind.Namespace || child.kind === Kind.Class || child.kind === Kind.Interface || child.kind === Kind.Enum) {
          visit(child);
        }
      }
    };
    visit(pkg.project);
  });
  const data = {
    kinds,
    packages: packages.map((pkg) => ({slug: pkg.slug, npm: pkg.npm})),
    pages,
    items,
  };
  fs.writeFileSync(path.join(OUT, 'assets', 'search-index.json'), JSON.stringify(data));
  return items.length;
}


// ---------------------------------------------------------------- landing

function packageStats(pkg) {
  const counts = {classes: 0, interfaces: 0, enums: 0, methods: 0};
  const walk = (node) => {
    for (const child of node.children || []) {
      if (child.kind === Kind.Class) counts.classes++;
      if (child.kind === Kind.Interface) counts.interfaces++;
      if (child.kind === Kind.Enum) counts.enums++;
      if (child.kind === Kind.Method && !child.inheritedFrom) counts.methods++;
      if (child.kind === Kind.Namespace || child.kind === Kind.Class || child.kind === Kind.Interface) walk(child);
    }
  };
  walk(pkg.project);
  return counts;
}

// shown in TypeScript or JavaScript, following the reader's pick on the guide pages
const HOME_SAMPLES = [
  {
    file: 'commands',
    caption: 'Prefix commands with a <code class="inline-code">CommandClient</code>',
    link: 'client/#guide-prefix-commands',
    ts: `import { CommandClient } from 'detritus-client';

const commandClient = new CommandClient(process.env.TOKEN!, {
  prefix: '..',
});

commandClient.add({
  name: 'ping',
  run: (context) => context.reply('pong!'),
});

commandClient.add({
  name: 'owner',
  onBefore: (context) => context.client.isOwner(context.userId),
  onCancel: (context) => context.reply('Owner only, sorry.'),
  run: (context) => context.reply('Hello, owner.'),
});

(async () => {
  const client = await commandClient.run();
  console.log(\`Running \${client.shardCount} shards\`);
})();`,
    js: `const { CommandClient } = require('detritus-client');

const commandClient = new CommandClient(process.env.TOKEN, {
  prefix: '..',
});

commandClient.add({
  name: 'ping',
  run: (context) => context.reply('pong!'),
});

commandClient.add({
  name: 'owner',
  onBefore: (context) => context.client.isOwner(context.userId),
  onCancel: (context) => context.reply('Owner only, sorry.'),
  run: (context) => context.reply('Hello, owner.'),
});

(async () => {
  const client = await commandClient.run();
  console.log(\`Running \${client.shardCount} shards\`);
})();`,
  },
  {
    file: 'slash',
    caption: 'Slash commands, synced with Discord on startup',
    link: 'client/#guide-slash-commands',
    ts: `import { Constants, Interaction, InteractionCommandClient } from 'detritus-client';
const { ApplicationCommandOptionTypes } = Constants;

const interactionClient = new InteractionCommandClient(process.env.TOKEN!);

interactionClient.add({
  name: 'avatar',
  description: 'Show someone\\'s avatar',
  options: [
    {
      name: 'user',
      description: 'Whose avatar to show',
      type: ApplicationCommandOptionTypes.USER,
      default: (context: Interaction.InteractionContext) => context.user,
    },
  ],
  run: (context, args) => context.editOrRespond(args.user.avatarUrl),
});

interactionClient.run();`,
    js: `const { Constants, InteractionCommandClient } = require('detritus-client');
const { ApplicationCommandOptionTypes } = Constants;

const interactionClient = new InteractionCommandClient(process.env.TOKEN);

interactionClient.add({
  name: 'avatar',
  description: 'Show someone\\'s avatar',
  options: [
    {
      name: 'user',
      description: 'Whose avatar to show',
      type: ApplicationCommandOptionTypes.USER,
      default: (context) => context.user,
    },
  ],
  run: (context, args) => context.editOrRespond(args.user.avatarUrl),
});

interactionClient.run();`,
  },
  {
    file: 'events',
    caption: 'Gateway events, cached into typed structures',
    link: 'client/#guide-events',
    ts: `import { ShardClient } from 'detritus-client';

const client = new ShardClient(process.env.TOKEN!, {
  gateway: {intents: ['GUILDS', 'GUILD_MESSAGES', 'MESSAGE_CONTENT']},
});

client.on('guildCreate', ({guild}) => {
  console.log(\`Joined \${guild.name} (\${guild.memberCount} members)\`);
});

client.on('messageCreate', async ({message}) => {
  if (message.content === '!ping') {
    await message.reply('pong!');
  }
});

client.run();`,
    js: `const { ShardClient } = require('detritus-client');

const client = new ShardClient(process.env.TOKEN, {
  gateway: {intents: ['GUILDS', 'GUILD_MESSAGES', 'MESSAGE_CONTENT']},
});

client.on('guildCreate', ({guild}) => {
  console.log(\`Joined \${guild.name} (\${guild.memberCount} members)\`);
});

client.on('messageCreate', async ({message}) => {
  if (message.content === '!ping') {
    await message.reply('pong!');
  }
});

client.run();`,
  },
  {
    file: 'rest',
    caption: 'Just the REST API, no gateway connection',
    link: 'client-rest/',
    ts: `import { Client } from 'detritus-client-rest';

const client = new Client(process.env.TOKEN!);

(async () => {
  // ratelimits are queued and retried for you
  const message = await client.createMessage(channelId, {
    content: 'Sent over plain REST',
    embed: {description: 'No websocket needed'},
  });

  await client.createReaction(channelId, message.id, '👍');
})();`,
    js: `const { Client } = require('detritus-client-rest');

const client = new Client(process.env.TOKEN);

(async () => {
  // ratelimits are queued and retried for you
  const message = await client.createMessage(channelId, {
    content: 'Sent over plain REST',
    embed: {description: 'No websocket needed'},
  });

  await client.createReaction(channelId, message.id, '👍');
})();`,
  },
];

// the dependency tree on the home page, `utils` is shown on its own since every other package uses it
const LAYER_TREE = [
  {slug: 'client', children: [
    {slug: 'client-rest', children: [{slug: 'rest'}]},
    {slug: 'client-socket'},
  ]},
];
const LAYER_SHARED = 'utils';

function renderLanding() {
  const client = packages.find((pkg) => pkg.slug === 'client');
  const clientRest = packages.find((pkg) => pkg.slug === 'client-rest');
  const link = (name, pkg = client) => {
    const node = model.resolveName(name, pkg);
    return node ? model.url(node) : `${BASE}${pkg.slug}/`;
  };

  const installs = [
    ['npm', 'npm install detritus-client'],
    ['yarn', 'yarn add detritus-client'],
    ['pnpm', 'pnpm add detritus-client'],
  ];
  const installer = `<div class="installer" data-tabs>
  <div class="installer-tabs" role="tablist" aria-label="Package manager">${installs.map(([name], index) => `<button type="button" class="installer-tab" role="tab" aria-selected="${index === 0}" data-tab="${index}">${name}</button>`).join('')}</div>
  ${installs.map(([, command], index) => `<div class="installer-cmd" role="tabpanel" data-panel="${index}"${index ? ' hidden' : ''}><span class="prompt">$</span><code>${escapeHtml(command)}</code><button type="button" class="copy-btn" aria-label="Copy install command" data-copy="${escapeHtml(command)}">${ICON_COPY}</button></div>`).join('')}
</div>`;

  const window = `<div class="window" data-tabs>
  <div class="window-tabs" role="tablist" aria-label="Examples">${HOME_SAMPLES.map((sample, index) => `<button type="button" class="window-tab" role="tab" aria-selected="${index === 0}" data-tab="${index}">${icon('file-code')}<span data-variant="ts">${sample.file}.ts</span><span data-variant="js">${sample.file}.js</span></button>`).join('')}${LANG_TABS}</div>
  ${HOME_SAMPLES.map((sample, index) => `<div class="window-body" role="tabpanel" data-panel="${index}"${index ? ' hidden' : ''}>${codeBlock(sample.ts, 'ts', {variant: 'ts'})}${codeBlock(sample.js, 'js', {variant: 'js'})}<div class="window-caption">${sample.caption}<span class="sep">·</span><a href="${BASE}${sample.link}">Read more</a></div></div>`).join('')}
</div>`;

  const layerItem = ({slug, children}) => {
    const pkg = packages.find((item) => item.slug === slug);
    const stats = packageStats(pkg);
    const parts = [];
    if (stats.classes) parts.push(`<span><b>${stats.classes}</b> ${stats.classes === 1 ? 'class' : 'classes'}</span>`);
    if (stats.interfaces) parts.push(`<span><b>${stats.interfaces}</b> interfaces</span>`);
    if (stats.methods) parts.push(`<span><b>${stats.methods}</b> methods</span>`);
    const external = (pkg.meta.dependencies || []).filter((name) => !name.startsWith('detritus-'));
    if (external.length) parts.push(`<span>on ${external.join(', ')}</span>`);
    const nested = children && children.length ? `<ol>${children.map(layerItem).join('')}</ol>` : '';
    return `<li>
  <a class="layer-link${slug === 'client' ? ' is-root' : ''}" href="${BASE}${slug}/">
    <span class="layer-name">${escapeHtml(pkg.npm)}<small>${escapeHtml(pkg.meta.version)}</small></span>
    <span class="layer-desc">${escapeHtml(pkg.tagline)}</span>
    <span class="layer-stats">${parts.join('')}</span>
    <span class="layer-go">${icon('arrow-right')}</span>
  </a>${nested}
</li>`;
  };
  const layers = `<ol class="tree">${LAYER_TREE.map(layerItem).join('')}</ol>
      <div class="tree-shared">
        <span class="section-label">Used by all four</span>
        <ol class="tree">${layerItem({slug: LAYER_SHARED})}</ol>
      </div>`;

  const restMethods = (clientRest.project.children.find((child) => child.name === 'Client').children || []).filter((child) => child.kind === Kind.Method).length;

  const componentSample = `const components = new Utils.Components({
  timeout: 5 * 60 * 1000,
  onTimeout: () => context.editOrRespond({content: 'Too slow!', components: []}),
});

components.createButton({
  label: 'Click me',
  run: (button) => button.editOrRespond({
    content: \`Clicked by \${button.user}\`,
    components: [],
  }),
});

await context.editOrRespond({content: 'Go ahead', components});`;

  const body = `<section class="home-hero">
  <div class="container hero-grid">
    <div>
      <a class="release" href="${BASE}client/"><span class="dot"></span>detritus-client ${escapeHtml(client.meta.version)}${icon('arrow-right')}</a>
      <h1 class="home-title">Discord bots in TypeScript, <em>from the gateway up.</em></h1>
      <p class="home-lead">A full client with caching, prefix and slash commands, components and voice, built from small packages you can also use on their own.</p>
      ${installer}
      <div class="home-actions">
        <a class="btn btn-primary" href="${BASE}client/">Read the guide ${icon('arrow-right', 'size-4')}</a>
        <a class="text-link" href="${BASE}client/#ref-classes">API reference ${icon('arrow-right')}</a>
      </div>
      <p class="home-note">Requires Node 22.19 or newer.</p>
    </div>
    ${window}
  </div>
</section>

<section class="home-section">
  <div class="container stack-grid">
    <div class="stack-intro">
      <div class="section-kicker">// the stack</div>
      <h2 class="home-h2">Five packages, one layer at a time</h2>
      <p class="home-sub">Each package is built on the ones below it and published on its own. Use the whole client, or drop down to raw REST and Gateway when you need the control.</p>
    </div>
    <div class="layers">${layers}</div>
  </div>
</section>

<section class="home-section">
  <div class="container">
    <div class="section-kicker">// what's in the box</div>
    <h2 class="home-h2">The boring parts, handled</h2>
    <div class="bento">
      <div class="tile wide">
        <span class="tile-tag">Utils.Components</span>
        <h3>Buttons and menus that call you back</h3>
        <p>Give a component a <code class="inline-code">run</code> function and it's called when someone uses it. No matching custom ids by hand, and timeouts clean up after themselves.</p>
        ${codeBlock(componentSample, 'js')}
      </div>
      <div class="tile">
        <span class="tile-tag">sharding</span>
        <h3>Scale without rewriting</h3>
        <p>Start with one shard and grow into processes. The event API stays the same.</p>
        <div class="tile-flow">
          <a href="${link('ShardClient')}">ShardClient<span>one shard</span></a>
          <a href="${link('ClusterClient')}">ClusterClient<span>many shards</span></a>
          <a href="${link('ClusterManager')}">ClusterManager<span>many processes</span></a>
        </div>
      </div>
      <div class="tile">
        <span class="tile-tag">detritus-client-rest</span>
        <h3>Every endpoint is a method</h3>
        <p>Requests queue per ratelimit bucket and retry after a 429, global and shared limits included.</p>
        <div class="tile-stat">${restMethods} <small>methods on one <code class="inline-code">Client</code></small></div>
      </div>
      <div class="tile">
        <span class="tile-tag">caching</span>
        <h3>Caches you control</h3>
        <p>Every collection can be capped, expired or switched off, from messages to presences.</p>
      </div>
      <div class="tile">
        <span class="tile-tag">voice</span>
        <h3>Voice with DAVE</h3>
        <p>Join, send and receive audio with Discord's end-to-end encryption, and mix users together with <code class="inline-code">AudioMixer</code>.</p>
      </div>
      <div class="tile">
        <span class="tile-tag">typescript</span>
        <h3>Typed all the way down</h3>
        <p>Written in TypeScript, from raw gateway payloads in <code class="inline-code">GatewayRawEvents</code> up to every structure.</p>
      </div>
    </div>
  </div>
</section>

<section class="home-section">
  <div class="container help-row">
    <a class="help-link" href="${LINKS.discord}" target="_blank" rel="noopener">${icon('message')}<span><strong>Stuck on something?</strong><span>Ask in the Detritus Discord server.</span></span>${icon('external', 'go')}</a>
    <a class="help-link" href="https://github.com/detritusjs/client/issues" target="_blank" rel="noopener">${icon('github')}<span><strong>Found a bug?</strong><span>Open an issue on GitHub.</span></span>${icon('external', 'go')}</a>
  </div>
</section>`;

  writePage('index.html', page({
    base: BASE,
    title: '',
    description: 'Documentation for detritus-client, detritus-client-rest, detritus-client-socket, detritus-rest and detritus-utils.',
    body,
    active: '',
    packages,
  }));
}

function renderNotFound() {
  const body = `<section class="not-found container">
  <h1>Page not found</h1>
  <p>That page doesn't exist, it may have moved when the API changed.</p>
  <div class="hero-actions"><a class="btn btn-primary" href="${BASE}">Back to the docs</a></div>
</section>`;
  writePage('404.html', page({base: BASE, title: 'Not found', description: '', body, active: '', packages}));
}


// ---------------------------------------------------------------- run

renderLanding();
renderNotFound();
for (const pkg of packages) {
  const guide = loadGuide(pkg);
  for (const node of pkg.pages) {
    if (node.kind === Kind.Project || node.kind === Kind.Namespace) {
      renderContainerPage(node, pkg, guide);
    } else {
      renderObjectPage(node, pkg);
    }
  }
}
const searchCount = buildSearchIndex();
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

console.log(`[build] ${pageCount} pages, ${searchCount} search entries, ${Date.now() - started}ms -> ${path.relative(process.cwd(), OUT) || OUT}`);
