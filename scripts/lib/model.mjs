// Loads the TypeDoc JSON for every package and works out which page and anchor each reflection lives at.
import fs from 'node:fs';
import path from 'node:path';


export const Kind = {
  Project: 1,
  Module: 2,
  Namespace: 4,
  Enum: 8,
  EnumMember: 16,
  Variable: 32,
  Function: 64,
  Class: 128,
  Interface: 256,
  Constructor: 512,
  Property: 1024,
  Method: 2048,
  CallSignature: 4096,
  IndexSignature: 8192,
  ConstructorSignature: 16384,
  Parameter: 32768,
  TypeLiteral: 65536,
  TypeParameter: 131072,
  Accessor: 262144,
  GetSignature: 524288,
  SetSignature: 1048576,
  TypeAlias: 2097152,
  Reference: 4194304,
};

export const KIND_LABEL = {
  [Kind.Namespace]: 'namespace',
  [Kind.Enum]: 'enum',
  [Kind.EnumMember]: 'enum member',
  [Kind.Variable]: 'variable',
  [Kind.Function]: 'function',
  [Kind.Class]: 'class',
  [Kind.Interface]: 'interface',
  [Kind.Constructor]: 'constructor',
  [Kind.Property]: 'property',
  [Kind.Method]: 'method',
  [Kind.Accessor]: 'accessor',
  [Kind.TypeAlias]: 'type',
};

// kinds that get a page of their own
const PAGE_KINDS = new Set([Kind.Project, Kind.Namespace, Kind.Class, Kind.Interface]);

// when a short name is shared (like `Message`), prefer the class, then namespace, then interface
const NAME_PRIORITY = [Kind.Class, Kind.Namespace, Kind.Interface, Kind.Enum, Kind.Function, Kind.TypeAlias, Kind.Variable];
function pickUnique(nodes) {
  if (!nodes || !nodes.length) {
    return null;
  }
  for (const kind of NAME_PRIORITY) {
    const matches = nodes.filter((node) => node.kind === kind);
    if (matches.length === 1) {
      return matches[0];
    }
    if (matches.length > 1) {
      return null;
    }
  }
  return null;
}

export function anchorId(name) {
  return String(name).replace(/[^A-Za-z0-9_$.-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

export function isInternalName(name) {
  return /^_/.test(name) || /^\[/.test(name);
}


export class DocsModel {
  constructor({dataDir, packages, base}) {
    this.base = base;
    this.packages = [];
    this.byPackageName = new Map();

    for (const config of packages) {
      const file = path.join(dataDir, `${config.slug}.json`);
      if (!fs.existsSync(file)) {
        throw new Error(`Missing ${file}, run \`npm run extract\` first.`);
      }
      const project = JSON.parse(fs.readFileSync(file, 'utf8'));
      const pkg = {
        ...config,
        project,
        meta: project.__meta,
        byId: new Map(),
        byQualified: new Map(),
        topLevelByName: new Map(),
        pages: [],
      };
      this.packages.push(pkg);
      this.byPackageName.set(config.npm, pkg);
      this.index(pkg);
    }
  }

  index(pkg) {
    const usedAnchors = new Map();
    const walk = (node, parent, namePath) => {
      node.__parent = parent;
      node.__pkg = pkg;
      pkg.byId.set(node.id, node);

      if (node.kind === Kind.Project) {
        node.__path = [];
        node.__dir = pkg.slug;
        node.__page = `${pkg.slug}/index.html`;
        node.__url = `${pkg.slug}/`;
        node.__anchor = '';
      } else if (node.kind === Kind.Namespace) {
        node.__path = [...namePath, node.name];
        node.__dir = `${parent.__dir}/${node.name}`;
        node.__page = `${node.__dir}/index.html`;
        node.__url = `${node.__dir}/`;
        node.__anchor = '';
      } else if (node.kind === Kind.Class || node.kind === Kind.Interface) {
        node.__path = [...namePath, node.name];
        let file = `${parent.__dir}/${node.name}.html`;
        if (pkg.pages.some((page) => page.__page === file)) {
          file = `${parent.__dir}/${node.name}-${KIND_LABEL[node.kind]}.html`;
        }
        node.__page = file;
        node.__url = file;
        node.__anchor = '';
      } else if (parent && parent.kind === Kind.Enum) {
        node.__path = [...namePath, node.name];
        node.__page = parent.__page;
        node.__anchor = `${parent.__anchor}.${anchorId(node.name)}`;
        node.__url = `${parent.__page.replace(/index\.html$/, '')}#${node.__anchor}`;
      } else if (parent && PAGE_KINDS.has(parent.kind)) {
        node.__path = [...namePath, node.name];
        node.__page = parent.__page;
        const isMember = parent.kind === Kind.Class || parent.kind === Kind.Interface;
        const prefix = (isMember && node.flags && node.flags.isStatic) ? 'static-' : '';
        node.__anchor = prefix + anchorId(node.name);
        // two members can share a name (a property and a namespace-level type, say), keep anchors unique per page
        const used = usedAnchors.get(node.__page) || new Set();
        if (used.has(node.__anchor)) {
          node.__anchor += `-${(KIND_LABEL[node.kind] || 'item').replace(' ', '-')}`;
        }
        used.add(node.__anchor);
        usedAnchors.set(node.__page, used);
        node.__url = `${parent.__page.replace(/index\.html$/, '')}#${node.__anchor}`;
      } else {
        // signatures, parameters, type literals; these point back at whatever owns them
        node.__path = namePath;
        node.__page = parent ? parent.__page : null;
        node.__anchor = parent ? parent.__anchor : '';
        node.__url = parent ? parent.__url : null;
      }

      if (PAGE_KINDS.has(node.kind)) {
        pkg.pages.push(node);
      }
      if (node.__path && node.__path.length && node.kind !== Kind.Parameter && node.kind !== Kind.TypeParameter) {
        const qualified = node.__path.join('.');
        if (!pkg.byQualified.has(qualified)) {
          pkg.byQualified.set(qualified, node);
        }
        if (parent && (parent.kind === Kind.Project || parent.kind === Kind.Namespace)) {
          const list = pkg.topLevelByName.get(node.name) || [];
          list.push(node);
          pkg.topLevelByName.set(node.name, list);
        }
      }

      const childPath = (node.kind === Kind.Project) ? [] : node.__path;
      for (const child of node.children || []) {
        walk(child, node, childPath);
      }
      for (const signature of node.signatures || []) {
        walk(signature, node, childPath);
        for (const parameter of signature.parameters || []) {
          walk(parameter, signature, childPath);
        }
      }
      for (const key of ['getSignature', 'setSignature']) {
        if (node[key]) {
          walk(node[key], node, childPath);
        }
      }
    };
    walk(pkg.project, null, []);
  }

  url(node) {
    if (!node || !node.__url) {
      return null;
    }
    return this.base + node.__url;
  }

  // resolves a TypeDoc reference target (a numeric id or {packageName, qualifiedName}) to a node
  resolveTarget(target, pkg) {
    if (typeof target === 'number') {
      return pkg.byId.get(target) || null;
    }
    if (target && typeof target === 'object' && target.packageName) {
      const other = this.byPackageName.get(target.packageName);
      if (other) {
        return other.byQualified.get(target.qualifiedName) || null;
      }
    }
    return null;
  }

  // resolves something written in prose, like `ShardClient`, `Structures.Message` or `Client.createMessage()`
  resolveName(text, pkg) {
    const name = String(text).trim().replace(/\(\)$/, '');
    if (!/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(name)) {
      return null;
    }
    const ordered = [pkg, ...this.packages.filter((other) => other !== pkg)];
    for (const candidate of ordered) {
      const found = candidate.byQualified.get(name);
      if (found && found.__url) {
        return found;
      }
    }
    // `Class.member` where Class is a top-level name somewhere
    const parts = name.split('.');
    for (const candidate of ordered) {
      const head = pickUnique(candidate.topLevelByName.get(parts[0]));
      if (head) {
        let node = head;
        for (const part of parts.slice(1)) {
          node = (node.children || []).find((child) => child.name === part);
          if (!node) {
            break;
          }
        }
        if (node && node.__url) {
          return node;
        }
      }
    }
    return null;
  }
}
