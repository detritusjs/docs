// Turns TypeDoc type objects, signatures and comments into HTML.
import { escapeHtml } from './highlight.mjs';
import { markdown } from './markdown.mjs';
import { Kind } from './model.mjs';


const MAX_INLINE_MEMBERS = 12;
const MAX_DEPTH = 4;

const kw = (value) => `<span class="tk-k">${value}</span>`;
const punct = (value) => `<span class="tk-p">${escapeHtml(value)}</span>`;

export function stripTags(html) {
  return String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}


export class TypeRenderer {
  constructor(model, pkg) {
    this.model = model;
    this.pkg = pkg;
  }

  link(node, label) {
    const href = this.model.url(node);
    if (!href) {
      return label;
    }
    return `<a class="type-link" href="${href}">${label}</a>`;
  }

  typeArguments(args, depth) {
    if (!args || !args.length) {
      return '';
    }
    return punct('<') + args.map((arg) => this.type(arg, depth + 1)).join(punct(', ')) + punct('>');
  }

  wrapIfComplex(type, depth) {
    const html = this.type(type, depth);
    if (type && ['union', 'intersection', 'conditional'].includes(type.type)) {
      return punct('(') + html + punct(')');
    }
    if (type && type.type === 'reflection' && type.declaration && type.declaration.signatures) {
      return punct('(') + html + punct(')');
    }
    return html;
  }

  type(type, depth = 0) {
    if (!type) {
      return '<span class="tk-t">any</span>';
    }
    if (depth > MAX_DEPTH + 2) {
      return punct('…');
    }
    switch (type.type) {
      case 'intrinsic':
        return `<span class="tk-t">${escapeHtml(type.name)}</span>`;
      case 'literal': {
        const value = type.value;
        if (value === null) {
          return kw('null');
        }
        if (typeof value === 'string') {
          return `<span class="tk-s">${escapeHtml(JSON.stringify(value))}</span>`;
        }
        if (typeof value === 'object' && 'value' in value) {
          return `<span class="tk-n">${value.negative ? '-' : ''}${escapeHtml(value.value)}n</span>`;
        }
        return `<span class="tk-n">${escapeHtml(String(value))}</span>`;
      }
      case 'reference': {
        const name = escapeHtml(type.name);
        let label = `<span class="tk-t">${name}</span>`;
        if (!type.refersToTypeParameter) {
          const node = this.model.resolveTarget(type.target, this.pkg);
          if (node) {
            label = this.link(node, label);
          } else if (type.externalUrl) {
            label = `<a class="type-link external" href="${escapeHtml(type.externalUrl)}" target="_blank" rel="noopener">${label}</a>`;
          }
        }
        return label + this.typeArguments(type.typeArguments, depth);
      }
      case 'array':
        return this.wrapIfComplex(type.elementType, depth + 1) + punct('[]');
      case 'union': {
        const parts = type.types.map((part) => this.type(part, depth + 1));
        return parts.join(` ${punct('|')} `);
      }
      case 'intersection':
        return type.types.map((part) => this.wrapIfComplex(part, depth + 1)).join(` ${punct('&')} `);
      case 'tuple':
        return punct('[') + (type.elements || []).map((element) => this.type(element, depth + 1)).join(punct(', ')) + punct(']');
      case 'namedTupleMember':
        return `${escapeHtml(type.name)}${type.isOptional ? '?' : ''}${punct(':')} ${this.type(type.element, depth + 1)}`;
      case 'optional':
        return this.type(type.elementType, depth + 1) + punct('?');
      case 'rest':
        return punct('...') + this.type(type.elementType, depth + 1);
      case 'typeOperator':
        return `${kw(type.operator)} ${this.type(type.target, depth + 1)}`;
      case 'query':
        return `${kw('typeof')} ${this.type(type.queryType, depth + 1)}`;
      case 'indexedAccess':
        return this.type(type.objectType, depth + 1) + punct('[') + this.type(type.indexType, depth + 1) + punct(']');
      case 'conditional':
        return [
          this.type(type.checkType, depth + 1),
          kw('extends'),
          this.type(type.extendsType, depth + 1),
          punct('?'),
          this.type(type.trueType, depth + 1),
          punct(':'),
          this.type(type.falseType, depth + 1),
        ].join(' ');
      case 'mapped': {
        const readonly = type.readonlyModifier === '+' ? kw('readonly') + ' ' : '';
        const optional = type.optionalModifier === '+' ? '?' : (type.optionalModifier === '-' ? '-?' : '');
        return `${punct('{')} ${readonly}${punct('[')}${escapeHtml(type.parameter)} ${kw('in')} ${this.type(type.parameterType, depth + 1)}${punct(']')}${optional}${punct(':')} ${this.type(type.templateType, depth + 1)} ${punct('}')}`;
      }
      case 'predicate': {
        const asserts = type.asserts ? kw('asserts') + ' ' : '';
        return type.targetType
          ? `${asserts}${escapeHtml(type.name)} ${kw('is')} ${this.type(type.targetType, depth + 1)}`
          : `${asserts}${escapeHtml(type.name)}`;
      }
      case 'templateLiteral': {
        let out = escapeHtml(type.head);
        for (const [part, text] of type.tail) {
          out += '${' + this.type(part, depth + 1) + '}' + escapeHtml(text);
        }
        return `<span class="tk-s">\`${out}\`</span>`;
      }
      case 'inferred':
        return `${kw('infer')} ${escapeHtml(type.name)}`;
      case 'reflection':
        return this.declaration(type.declaration, depth + 1);
      case 'unknown':
        return `<span class="tk-t">${escapeHtml(type.name)}</span>`;
      default:
        return escapeHtml(type.name || type.type || 'unknown');
    }
  }

  // inline object / function types
  declaration(declaration, depth) {
    if (!declaration) {
      return punct('{}');
    }
    if (declaration.signatures && declaration.signatures.length && !(declaration.children && declaration.children.length)) {
      return declaration.signatures.map((signature) => this.functionType(signature, depth)).join(` ${punct('|')} `);
    }
    const members = [];
    for (const index of declaration.indexSignatures || []) {
      const parameter = (index.parameters || [])[0];
      members.push(`${punct('[')}${escapeHtml(parameter ? parameter.name : 'key')}${punct(':')} ${this.type(parameter && parameter.type, depth + 1)}${punct(']')}${punct(':')} ${this.type(index.type, depth + 1)}`);
    }
    const children = declaration.children || [];
    if (depth > MAX_DEPTH && children.length) {
      return punct('{ … }');
    }
    for (const child of children.slice(0, MAX_INLINE_MEMBERS)) {
      const optional = child.flags && child.flags.isOptional ? '?' : '';
      const readonly = child.flags && child.flags.isReadonly ? kw('readonly') + ' ' : '';
      let valueType = child.type;
      if (!valueType && child.signatures && child.signatures.length) {
        members.push(`${readonly}${escapeHtml(child.name)}${optional}${this.signatureTail(child.signatures[0], depth + 1)}`);
        continue;
      }
      if (!valueType && child.getSignature) {
        valueType = child.getSignature.type;
      }
      members.push(`${readonly}${escapeHtml(child.name)}${optional}${punct(':')} ${this.type(valueType, depth + 1)}`);
    }
    if (children.length > MAX_INLINE_MEMBERS) {
      members.push(`<span class="tk-c">… ${children.length - MAX_INLINE_MEMBERS} more</span>`);
    }
    if (!members.length) {
      return punct('{}');
    }
    return `${punct('{')} ${members.join(`${punct(';')} `)} ${punct('}')}`;
  }

  typeParameters(parameters) {
    if (!parameters || !parameters.length) {
      return '';
    }
    return punct('<') + parameters.map((parameter) => {
      let out = `<span class="tk-t">${escapeHtml(parameter.name)}</span>`;
      if (parameter.type) {
        out += ` ${kw('extends')} ${this.type(parameter.type, 1)}`;
      }
      if (parameter.default) {
        out += ` ${punct('=')} ${this.type(parameter.default, 1)}`;
      }
      return out;
    }).join(punct(', ')) + punct('>');
  }

  parameter(parameter, depth = 0) {
    const rest = parameter.flags && parameter.flags.isRest ? punct('...') : '';
    const optional = (parameter.flags && parameter.flags.isOptional) || parameter.defaultValue !== undefined ? '?' : '';
    const name = /^__\d*$/.test(parameter.name) ? 'options' : parameter.name;
    return `${rest}<span class="tk-v">${escapeHtml(name)}</span>${optional}${punct(':')} ${this.type(parameter.type, depth + 1)}`;
  }

  parameterList(parameters, depth = 0, multiline = false) {
    const list = (parameters || []).map((parameter) => this.parameter(parameter, depth));
    if (!list.length) {
      return punct('()');
    }
    if (multiline) {
      return punct('(') + '\n' + list.map((item) => `  ${item}`).join(punct(',') + '\n') + punct(',') + '\n' + punct(')');
    }
    return punct('(') + list.join(punct(', ')) + punct(')');
  }

  signatureTail(signature, depth = 0) {
    return this.typeParameters(signature.typeParameters) + this.parameterList(signature.parameters, depth) + punct(':') + ' ' + this.type(signature.type, depth);
  }

  functionType(signature, depth = 0) {
    const prefix = signature.kind === Kind.ConstructorSignature ? kw('new') + ' ' : '';
    return prefix + this.typeParameters(signature.typeParameters) + this.parameterList(signature.parameters, depth) + ' ' + punct('=>') + ' ' + this.type(signature.type, depth);
  }

  // the full `name(args): Return` line shown in a code block, wraps the parameters if it gets long
  signature(name, signature, {prefix = '', isConstructor = false} = {}) {
    const typeParameters = this.typeParameters(signature.typeParameters);
    const returns = isConstructor ? '' : punct(':') + ' ' + this.type(signature.type);
    const shortParams = this.parameterList(signature.parameters);
    const head = `${prefix}<span class="tk-f">${escapeHtml(name)}</span>${typeParameters}`;
    const oneLine = head + shortParams + returns;
    if (stripTags(oneLine).length <= 90 || !(signature.parameters || []).length) {
      return oneLine;
    }
    return head + this.parameterList(signature.parameters, 0, true) + returns;
  }
}


// TypeDoc comments are arrays of parts, turn them back into markdown and render that
export function commentParts(parts, renderer) {
  if (!parts) {
    return '';
  }
  return parts.map((part) => {
    if (part.kind === 'inline-tag') {
      const text = part.text || (part.target && part.target.qualifiedName) || '';
      return '`' + text.replace(/`/g, '') + '`';
    }
    return part.text;
  }).join('');
}

export function renderComment(comment, renderer, options = {}) {
  if (!comment) {
    return '';
  }
  const resolveLink = (code) => {
    const node = renderer.model.resolveName(code, renderer.pkg);
    return node ? renderer.model.url(node) : null;
  };
  const text = commentParts(comment.summary, renderer).trim();
  let html = text ? markdown(text, {resolveLink}) : '';
  if (options.summaryOnly) {
    return html;
  }
  for (const tag of comment.blockTags || []) {
    const body = commentParts(tag.content, renderer).trim();
    if (tag.tag === '@deprecated') {
      html += `<div class="callout callout-warning"><p><strong>Deprecated.</strong> ${body ? markdown(body, {resolveLink}).replace(/^<p>|<\/p>$/g, '') : ''}</p></div>`;
    } else if (tag.tag === '@example') {
      html += `<h4 class="section-label">Example</h4>${markdown(body.includes('```') ? body : '```ts\n' + body + '\n```', {resolveLink})}`;
    } else if (tag.tag === '@since') {
      html += `<p class="meta-line">Since ${escapeHtml(body)}</p>`;
    }
  }
  return html;
}

export function firstSentence(comment) {
  if (!comment || !comment.summary) {
    return '';
  }
  const text = commentParts(comment.summary).trim().split(/\n\s*\n/)[0];
  return text.replace(/\s+/g, ' ');
}
