import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// A deliberately limited packer for this repository's static relative imports.
// Unexpected syntax fails the build instead of shipping unresolved imports.
export async function buildViewerBundle(entry = 'tools/track-viewer/app.mjs') {
  const entries = Array.isArray(entry) ? entry : [entry];
  const modules = new Map();
  async function visit(id) {
    if (modules.has(id)) return;
    modules.set(id, '');
    const source = await readFile(path.join(root, id), 'utf8');
    if (id.endsWith('.json')) { modules.set(id, `module.exports = ${JSON.stringify(JSON.parse(source))};`); return; }
    const imports = [];
    const dependencyFor = relative => {
      if (!relative.startsWith('.')) throw new Error(`Nonlocal import in ${id}`);
      const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(id), relative));
      imports.push(dependency);
      return dependency;
    };
    const destructuring = binding => binding.replace(/\b(\w+)\s+as\s+(\w+)\b/g, '$1: $2');
    let code = source.replace(/^import\s+([\s\S]+?)\s+from\s+['"](.+?)['"](?:\s+with\s*\{[^}]+\})?\s*;/gm, (_, binding, relative) => {
      const name = binding.trim().replace(/^\*\s+as\s+/, '');
      return `const ${destructuring(name)} = require(${JSON.stringify(dependencyFor(relative))});`;
    });
    const exports = [], functions = [];
    code = code.replace(/^export (async )?(class|function|const|let) (\w+)/gm, (_, async, kind, name) => {
      exports.push(name); if (kind === 'function') functions.push(name);
      return `${async ?? ''}${kind} ${name}`;
    });
    code = code.replace(/^export\s*\{([^}]+)\}(?:\s+from\s+['"]([^'"]+)['"])?\s*;/gm, (_, names, relative) => {
      const entries = names.split(',').map(value => value.trim()).filter(Boolean).map(value => value.split(/\s+as\s+/));
      if (relative) return `Object.assign(module.exports, Object.fromEntries(${JSON.stringify(entries)}.map(([source, target = source]) => [target, require(${JSON.stringify(dependencyFor(relative))})[source]])));`;
      for (const [source, target = source] of entries) exports.push(`${target}: ${source}`);
      return '';
    });
    if (/^\s*(import|export)\s/m.test(code)) throw new Error(`Unsupported module syntax in ${id}`);
    //ES module function declarations are initialized before a circular import
    //is evaluated. Publish their hoisted bindings before requiring children;
    //otherwise game-network-protocol/projectile-launch capture undefined.
    modules.set(id, `Object.assign(module.exports, {${functions.join(',')}});\n${code}\nObject.assign(module.exports, {${exports.join(',')}});`);
    for (const dependency of imports) await visit(dependency);
  }
  for (const id of entries) await visit(id);
  await visit('tools/track-viewer/byte-buffer.mjs');
  const definitions = [...modules].map(([id, source]) => `${JSON.stringify(id)}: function(require, module, Buffer) {\n${source}\n}`).join(',\n');
  const result = Array.isArray(entry) ? `Object.fromEntries(${JSON.stringify(entries)}.map(id => [id, require(id)]))` : `require(${JSON.stringify(entry)})`;
  return `(function() {\n'use strict';\nconst modules = {\n${definitions}\n};\nconst cache = {};\nlet Buffer;\nfunction require(id) {\n if (cache[id]) return cache[id].exports;\n const module = cache[id] = {exports:{}};\n modules[id](require, module, Buffer);\n return module.exports;\n}\nBuffer = require('tools/track-viewer/byte-buffer.mjs').ByteBuffer;\nreturn ${result};\n})()`;
}
