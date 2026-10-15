// Serves `dist/` locally for previewing: `npm run serve` then open http://localhost:4173
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT) || 4173;
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) {
    response.writeHead(403).end();
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file)) {
    response.writeHead(404, {'content-type': TYPES['.html']});
    fs.createReadStream(path.join(ROOT, '404.html')).pipe(response);
    return;
  }
  response.writeHead(200, {'content-type': TYPES[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(response);
}).listen(PORT, () => {
  console.log(`[serve] http://localhost:${PORT}`);
});
