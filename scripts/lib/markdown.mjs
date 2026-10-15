// A small markdown renderer for the guides and doc comments.
// Supports headings, paragraphs, fenced code, lists, blockquote callouts, pipe tables, and inline code/links/emphasis.
// A ```ts fence followed by a ```js fence (or the other way around) is one example written in both languages.
import { escapeHtml, highlight } from './highlight.mjs';


export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`'"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const ICON_COPY = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';

export function codeBlock(code, language = '', {title, variant} = {}) {
  const lang = language ? ` data-lang="${escapeHtml(language)}"` : '';
  const variantAttr = variant ? ` data-variant="${variant}"` : '';
  const head = title
    ? `<div class="code-title"><span>${escapeHtml(title)}</span></div>`
    : '';
  return `<div class="code-block${title ? ' has-title' : ''}"${lang}${variantAttr}>${head}<pre><code>${highlight(code.replace(/\n+$/, ''), language)}</code></pre><button type="button" class="copy-btn" aria-label="Copy code">${ICON_COPY}</button></div>`;
}


const VARIANTS = {ts: 'ts', typescript: 'ts', js: 'js', javascript: 'js'};

export function codeVariant(language) {
  return VARIANTS[String(language).toLowerCase()] || null;
}

// the small TS / JS switch on every example, app.js keeps them all in sync
export const LANG_TABS = `<div class="lang-tabs" role="group" aria-label="Example language">${['ts', 'js'].map((variant) => (
  `<button type="button" data-set-lang="${variant}" aria-pressed="${variant === 'ts'}" title="Show ${variant === 'ts' ? 'TypeScript' : 'JavaScript'} examples">${variant.toUpperCase()}</button>`
)).join('')}</div>`;

// The same example in TypeScript and JavaScript, `blocks` is [{code, language, title}].
// Both are in the page, css shows the one matching <html data-code-lang>, which defaults to ts.
export function codeGroup(blocks) {
  const sorted = blocks
    .map((block) => ({...block, variant: codeVariant(block.language)}))
    .sort((a, b) => (a.variant === 'ts' ? -1 : 1) - (b.variant === 'ts' ? -1 : 1));
  const titles = sorted.some((block) => block.title)
    ? sorted.map((block) => `<span data-variant="${block.variant}">${escapeHtml(block.title || '')}</span>`).join('')
    : '';
  return `<div class="code-group"><div class="code-group-head"><span class="code-group-title">${titles}</span>${LANG_TABS}</div>${sorted.map((block) => codeBlock(block.code, block.language, {variant: block.variant})).join('')}</div>`;
}


function readFence(lines, start) {
  const fence = start < lines.length && lines[start].match(/^```\s*([\w-]*)\s*(.*)$/);
  if (!fence) {
    return null;
  }
  const body = [];
  let i = start + 1;
  while (i < lines.length && !/^```\s*$/.test(lines[i])) {
    body.push(lines[i]);
    i++;
  }
  return {code: body.join('\n'), language: fence[1], title: fence[2] || undefined, next: i + 1};
}


// `resolveLink` turns things like `ShardClient` or `Structures.Message` into urls, it's optional
export function inline(text, {resolveLink} = {}) {
  const codes = [];
  let out = String(text).replace(/`([^`]+)`/g, (match, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = escapeHtml(out);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
    const external = /^https?:/.test(href);
    return `<a href="${href}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
  out = out.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  out = out.replace(/\u0000(\d+)\u0000/g, (match, index) => {
    const code = codes[Number(index)];
    const href = resolveLink ? resolveLink(code) : null;
    const html = `<code class="inline-code">${escapeHtml(code)}</code>`;
    return href ? `<a class="code-link" href="${href}">${html}</a>` : html;
  });
  return out;
}


function renderTable(lines, options) {
  const rows = lines.map((line) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((cell) => cell.trim()));
  const [head, , ...body] = rows;
  const th = head.map((cell) => `<th>${inline(cell, options)}</th>`).join('');
  const tr = body.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell, options)}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}


export function markdown(source, options = {}) {
  const lines = String(source).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const isBlockStart = (line) => (
    /^```/.test(line) || /^#{1,6}\s/.test(line) || /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) || /^>\s?/.test(line) || /^\s*\|.*\|\s*$/.test(line)
  );

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = readFence(lines, i);
    if (fence) {
      i = fence.next;
      const variant = codeVariant(fence.language);
      if (variant) {
        // a fence in the other language right after this one is its translation
        let j = i;
        while (j < lines.length && !lines[j].trim()) {
          j++;
        }
        const partner = readFence(lines, j);
        const partnerVariant = partner && codeVariant(partner.language);
        if (partnerVariant && partnerVariant !== variant) {
          out.push(codeGroup([fence, partner]));
          i = partner.next;
          continue;
        }
      }
      out.push(codeBlock(fence.code, fence.language, {title: fence.title}));
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(6, heading[1].length + (options.headingOffset || 0));
      const id = slugify(heading[2]);
      const prefix = options.idPrefix ? `${options.idPrefix}-` : '';
      out.push(`<h${level} id="${prefix}${id}" class="md-h">${inline(heading[2], options)}</h${level}>`);
      i++;
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i]);
        i++;
      }
      out.push(renderTable(rows, options));
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      let kind = 'note';
      const first = body[0] || '';
      const marker = first.match(/^\*\*(Note|Tip|Warning|Important)\*\*:?\s*/i) || first.match(/^\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*/i);
      if (marker) {
        kind = marker[1].toLowerCase();
        body[0] = first.slice(marker[0].length);
        if (!body[0].trim()) {
          body.shift();
        }
      }
      out.push(`<div class="callout callout-${kind}">${markdown(body.join('\n'), options)}</div>`);
      continue;
    }

    const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+/);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[2]);
      const items = [];
      while (i < lines.length) {
        const current = lines[i];
        const item = current.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if (item && (/\d/.test(item[2]) === ordered)) {
          items.push(item[3]);
          i++;
        } else if (current.trim() && /^\s{2,}/.test(current) && items.length) {
          items[items.length - 1] += ' ' + current.trim();
          i++;
        } else {
          break;
        }
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag} class="md-list">${items.map((item) => `<li>${inline(item, options)}</li>`).join('')}</${tag}>`);
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !(paragraph.length && isBlockStart(lines[i]))) {
      paragraph.push(lines[i].trim());
      i++;
    }
    out.push(`<p>${inline(paragraph.join(' '), options)}</p>`);
  }

  return out.join('\n');
}
