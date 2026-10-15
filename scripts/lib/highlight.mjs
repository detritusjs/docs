// A tiny tokenizer good enough for the js/ts/json/bash snippets in the guides and signatures.
// Every token is escaped, so the output is safe to drop straight into a <pre>.

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const JS_KEYWORDS = new Set([
  'abstract', 'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'constructor', 'continue',
  'declare', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from',
  'function', 'get', 'if', 'implements', 'import', 'in', 'instanceof', 'interface', 'keyof', 'let', 'namespace',
  'new', 'null', 'of', 'private', 'protected', 'public', 'readonly', 'require', 'return', 'set', 'static', 'super',
  'switch', 'this', 'throw', 'true', 'try', 'type', 'typeof', 'undefined', 'var', 'void', 'while', 'yield',
]);

const JS_TYPES = new Set([
  'any', 'bigint', 'boolean', 'never', 'number', 'object', 'string', 'symbol', 'unknown',
]);

const JS_TOKEN = new RegExp([
  '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)', // 1 comment
  '(`(?:\\\\[\\s\\S]|[^`\\\\])*`|\'(?:\\\\.|[^\'\\\\\\n])*\'|"(?:\\\\.|[^"\\\\\\n])*")', // 2 string
  '(\\b(?:0x[\\da-fA-F_]+|\\d[\\d_]*(?:\\.\\d+)?(?:e[+-]?\\d+)?n?)\\b)', // 3 number
  '([A-Za-z_$][\\w$]*)', // 4 identifier
  '(\\s+)', // 5 whitespace
  '([\\s\\S])', // 6 anything else
].join('|'), 'g');

function highlightJs(code) {
  let out = '';
  let match;
  let previous = '';
  JS_TOKEN.lastIndex = 0;
  while ((match = JS_TOKEN.exec(code))) {
    const [token, comment, string, number, ident, space] = match;
    if (comment) {
      out += `<span class="tk-c">${escapeHtml(comment)}</span>`;
    } else if (string) {
      out += `<span class="tk-s">${escapeHtml(string)}</span>`;
    } else if (number) {
      out += `<span class="tk-n">${escapeHtml(number)}</span>`;
    } else if (ident) {
      const next = code.slice(JS_TOKEN.lastIndex).match(/^\s*(\S)/);
      const nextChar = next ? next[1] : '';
      if (JS_KEYWORDS.has(ident) && previous !== '.') {
        out += `<span class="tk-k">${ident}</span>`;
      } else if (JS_TYPES.has(ident)) {
        out += `<span class="tk-t">${ident}</span>`;
      } else if (nextChar === '(') {
        out += `<span class="tk-f">${ident}</span>`;
      } else if (/^[A-Z]/.test(ident)) {
        out += `<span class="tk-t">${ident}</span>`;
      } else {
        out += ident;
      }
    } else if (space) {
      out += space;
    } else {
      out += escapeHtml(token);
    }
    if (!space) {
      previous = token;
    }
  }
  return out;
}

function highlightBash(code) {
  return code.split('\n').map((line) => {
    if (/^\s*#/.test(line)) {
      return `<span class="tk-c">${escapeHtml(line)}</span>`;
    }
    const parts = line.match(/^(\s*)(\S+)([\s\S]*)$/);
    if (!parts) {
      return escapeHtml(line);
    }
    const rest = escapeHtml(parts[3]).replace(/(\s)(--?[\w-]+)/g, '$1<span class="tk-n">$2</span>');
    return `${parts[1]}<span class="tk-f">${escapeHtml(parts[2])}</span>${rest}`;
  }).join('\n');
}

export function highlight(code, language = '') {
  const lang = language.toLowerCase();
  if (['js', 'javascript', 'ts', 'typescript', 'json', 'jsonc', 'tsx', 'jsx'].includes(lang)) {
    return highlightJs(code);
  }
  if (['bash', 'sh', 'shell', 'zsh', 'console'].includes(lang)) {
    return highlightBash(code);
  }
  return escapeHtml(code);
}
