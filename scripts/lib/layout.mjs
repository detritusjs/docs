// The page chrome: <head>, sticky header, docs hero, sidebar shell and footer.
import { escapeHtml } from './highlight.mjs';


const ICON_PATHS = {
  'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  'book-open': '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  'bot': '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  'box': '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7"/><path d="m7.5 4.27 9 5.15"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'code': '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  'external': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3"/>',
  'file-code': '<path d="M10 12.5 8 15l2 2.5"/><path d="m14 12.5 2 2.5-2 2.5"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/>',
  'github': '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
  'globe': '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  'layers': '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  'link': '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>',
  'menu': '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  'message': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  'package': '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  'plug': '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
  'search': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'send': '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  'terminal': '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
  'wrench': '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  'zap': '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
};

export function icon(name, className = '') {
  return `<svg class="icon${className ? ' ' + className : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
}

export const LOGO = '<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#5865f2"/><circle cx="14" cy="18.5" r="5.5" fill="none" stroke="#fff" stroke-width="3"/><path d="M19.5 7.5v16.5" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>';

export const LINKS = {
  github: 'https://github.com/detritusjs',
  discord: 'https://discord.gg/NEq6wws',
  npm: 'https://www.npmjs.com/package/detritus-client',
  examples: 'https://github.com/detritusjs/client/tree/master/examples',
};


export function page({base, title, description, body, active, packages, searchPackage}) {
  const pkgLinks = packages.map((pkg) => (
    `<a href="${base}${pkg.slug}/" class="nav-pkg${active === pkg.slug ? ' is-active' : ''}">${icon(pkg.icon)}<strong>${escapeHtml(pkg.npm)}</strong><span>${escapeHtml(pkg.tagline)}</span></a>`
  )).join('');
  const fullTitle = title ? `${title} · Detritus` : 'Detritus · TypeScript libraries for Discord';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(description || '')}">
<meta name="theme-color" content="#202225">
<link rel="icon" href="${base}assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap">
<link rel="stylesheet" href="${base}assets/style.css">
<script>document.documentElement.classList.add('js')</script>
</head>
<body data-base="${base}" data-package="${searchPackage || ''}">
<a class="skip-link" href="#main">Skip to content</a>
<header class="topbar">
  <div class="container topbar-row">
    <a href="${base}" class="brand" aria-label="Detritus home">${LOGO}<span class="brand-name">detritus</span></a>
    <nav class="topnav" aria-label="Main">
      <details class="nav-menu${active ? ' is-active' : ''}">
        <summary>Packages ${icon('chevron-down')}</summary>
        <div class="nav-panel">${pkgLinks}</div>
      </details>
      <a href="${base}client/#guide-overview" class="topnav-link">Guide</a>
      <a href="${base}client/#ref-classes" class="topnav-link">API</a>
      <a href="${LINKS.examples}" class="topnav-link" target="_blank" rel="noopener">Examples</a>
    </nav>
    <div class="topbar-right">
      <button type="button" class="search-trigger" aria-label="Search the docs" data-open-palette>${icon('search')}<span class="label">Search docs…</span><kbd>⌘K</kbd></button>
      <a href="${LINKS.github}" class="icon-btn" target="_blank" rel="noopener" aria-label="GitHub">${icon('github')}</a>
      <a href="${LINKS.discord}" class="icon-btn" target="_blank" rel="noopener" aria-label="Discord server">${icon('message')}</a>
      <button type="button" class="icon-btn menu-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-nav">${icon('menu')}</button>
    </div>
  </div>
  <nav id="mobile-nav" class="mobile-nav" aria-label="Main" hidden>
    <div class="container">
      <span class="section-label">Packages</span>
      ${pkgLinks}
      <a href="${LINKS.examples}" class="topnav-link" target="_blank" rel="noopener">Examples on GitHub</a>
    </div>
  </nav>
</header>
<main id="main" class="site-main">
${body}
</main>
${footer({base, packages})}
<dialog class="palette" aria-label="Search the docs">
  <div class="search" role="search">
    ${icon('search', 'search-icon')}
    <input type="search" class="search-input" placeholder="Search every package…" aria-label="Search the docs" autocomplete="off" spellcheck="false">
    <kbd class="search-kbd">esc</kbd>
    <div class="search-results" role="listbox" hidden></div>
    <p class="palette-hint">Classes, methods, properties, enums and events across all five packages. Use ↑ ↓ and enter.</p>
  </div>
</dialog>
<script src="${base}assets/app.js" defer></script>
</body>
</html>
`;
}


function footer({base, packages}) {
  const year = new Date().getFullYear();
  return `<footer class="site-footer">
  <div class="container footer-row">
    <span class="footer-brand">${LOGO}<strong>detritus</strong><span>© 2019–${year} cakedan and contributors</span></span>
    <nav class="footer-links" aria-label="Footer">
      ${packages.map((pkg) => `<a href="${base}${pkg.slug}/">${escapeHtml(pkg.title)}</a>`).join('')}
      <a href="${LINKS.github}" target="_blank" rel="noopener">GitHub</a>
      <a href="${LINKS.discord}" target="_blank" rel="noopener">Discord</a>
    </nav>
  </div>
</footer>`;
}


// The darker band at the top of every docs page: eyebrow, title, description, package switcher and search
export function docsHero({base, packages, activeSlug, eyebrow, title, titleHtml, description, badges = ''}) {
  const tabs = packages.map((pkg) => (
    `<a href="${base}${pkg.slug}/" class="seg-item${pkg.slug === activeSlug ? ' is-active' : ''}"${pkg.slug === activeSlug ? ' aria-current="page"' : ''}>${escapeHtml(pkg.title)}</a>`
  )).join('');
  return `<section class="docs-hero">
  <div class="container">
    <div class="eyebrow">${eyebrow}</div>
    <h1 class="docs-title">${titleHtml || escapeHtml(title)}${badges}</h1>
    ${description ? `<div class="docs-desc">${description}</div>` : ''}
    <div class="docs-toolbar">
      <nav class="seg" aria-label="Package">${tabs}</nav>
      <div class="search" role="search">
        ${icon('search', 'search-icon')}
        <input type="search" class="search-input" placeholder="Search classes, methods, events…" aria-label="Search the docs" autocomplete="off" spellcheck="false">
        <kbd class="search-kbd">/</kbd>
        <div class="search-results" role="listbox" hidden></div>
      </div>
    </div>
  </div>
</section>`;
}


export function docsBody({sidebar, content, mobileToc = ''}) {
  return `<div class="container docs-grid">
  <aside class="docs-sidebar" aria-label="On this page">${sidebar}</aside>
  <div class="docs-content">${mobileToc}${content}</div>
</div>`;
}
