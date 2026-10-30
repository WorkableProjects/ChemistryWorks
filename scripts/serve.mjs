// Zero-dependency static server for local development and E2E tests.
//   node scripts/serve.mjs [port]      (default 3000; PORT env also honored; 0 = random)
// Mirrors netlify.toml: /test -> index.html. POST / returns 200 to simulate Netlify Forms.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8',
};

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'POST') {
      req.resume();
      req.on('end', () => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); });
      return;
    }
    let path = decodeURIComponent(url.pathname);
    if (path === '/' || path === '/test') path = '/index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    try {
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });
}

export function listen(port = 0) {
  return new Promise((resolveListen) => {
    const server = createServer();
    server.listen(port, '127.0.0.1', () => resolveListen({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? process.env.PORT ?? 3000);
  listen(port).then(({ url }) => console.log(`ChemistryWorks running at ${url}`));
}
