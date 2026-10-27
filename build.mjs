// Bundles src/js/main.js into assets/js/app.js – a single script that also
// runs when you double-click index.html. No dependencies, just Node.
//
//   npm run build   -> rebuild assets/js/app.js
//   npm run dev     -> build, rebuild on changes, server at http://localhost:5173
//
// Supported in src/js: import { a, b as c } from './file.js';
//                      export function / class / const / let

import { readFileSync, writeFileSync, mkdirSync, watch, existsSync, statSync, createReadStream } from 'node:fs';
import { dirname, resolve, relative, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const root = dirname(fileURLToPath(import.meta.url));
const entry = join(root, 'src', 'js', 'main.js');
const outfile = join(root, 'assets', 'js', 'app.js');
const dev = process.argv.includes('--dev');

const IMPORT = /^[ \t]*import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm;
const EXPORT = /^export\s+(async\s+function\*?|function\*?|class|const|let)\s+([A-Za-z_$][\w$]*)/gm;

function bundle() {
  const modules = new Map();
  const order = [];
  const visit = (file, from) => {
    if (modules.has(file)) {
      const m = modules.get(file);
      if (!m.done) throw new Error(`Circular import: ${relative(root, from)} -> ${relative(root, file)}`);
      return m;
    }
    if (!existsSync(file)) throw new Error(`File not found: ${relative(root, file)} (imported in ${relative(root, from)})`);
    const id = `$m${modules.size}`;
    const mod = { id, file, done: false, code: '' };
    modules.set(file, mod);
    let src = readFileSync(file, 'utf8');
    const head = [];
    src = src.replace(IMPORT, (_, names, spec) => {
      const dep = visit(resolve(dirname(file), spec), file);
      const binds = names.split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/\s+as\s+/, ': '));
      head.push(`const { ${binds.join(', ')} } = ${dep.id};`);
      return '';
    });
    const names = [];
    src = src.replace(EXPORT, (_, kind, name) => {
      names.push(name);
      return `${kind} ${name}`;
    });
    if (/^[ \t]*(import|export)\s/m.test(src)) {
      throw new Error(`Unsupported import/export form in ${relative(root, file)}`);
    }
    const label = relative(root, file).split(sep).join('/');
    mod.code = `// ${label}\nconst ${id} = (() => {\n${head.join('\n')}${head.length ? '\n' : ''}${src.trim()}\nreturn { ${names.join(', ')} };\n})();`;
    mod.done = true;
    order.push(mod);
    return mod;
  };
  visit(entry, entry);
  const banner = `/*! JustJoin website – built from src/js (do not edit by hand, run npm run build instead) */`;
  return `${banner}\n(() => {\n'use strict';\n\n${order.map((m) => m.code).join('\n\n')}\n})();\n`;
}

function build() {
  const t0 = Date.now();
  const code = bundle();
  mkdirSync(dirname(outfile), { recursive: true });
  writeFileSync(outfile, code);
  console.log(`  built assets/js/app.js (${(code.length / 1024).toFixed(1)} KB, ${Date.now() - t0} ms)`);
}

try {
  build();
} catch (err) {
  console.error(`  Build failed: ${err.message}`);
  if (!dev) process.exit(1);
}

if (dev) {
  let timer;
  watch(join(root, 'src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { build(); } catch (err) { console.error(`  Build failed: ${err.message}`); }
    }, 80);
  });

  const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
    '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
  };
  const port = Number(process.env.PORT) || 5173;
  // default: this computer only. To test on a phone on the same Wi-Fi: HOST=0.0.0.0
  const host = process.env.HOST || '127.0.0.1';
  createServer((req, res) => {
    let url;
    try { url = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
    let file = join(root, url === '/' ? 'index.html' : url);
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    createReadStream(file).pipe(res);
  }).listen(port, host, () => {
    console.log(`\n  JustJoin is running at http://localhost:${port}`);
    if (host === '0.0.0.0') console.log('  Also reachable on your Wi-Fi: http://<this computer’s IP>:' + port);
    console.log('');
  });
}
