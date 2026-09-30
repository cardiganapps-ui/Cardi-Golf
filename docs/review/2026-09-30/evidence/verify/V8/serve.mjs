// Minimal static server that mimics vercel.json: SPA rewrite to /index.html (except /api/),
// sw.js and push-sw.js no-cache, /assets/* immutable. Files are read on every request so a
// "deploy" is simply editing site/sw.js. Usage: node serve.mjs <dir> <port>
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
const [dir, port] = [process.argv[2], Number(process.argv[3])]
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.jpg': 'image/jpeg' }
http.createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = normalize(join(dir, path))
  if (!file.startsWith(normalize(dir))) { res.writeHead(403).end(); return }
  let ok = false
  try { ok = (await stat(file)).isFile() } catch { ok = false }
  if (!ok) {
    if (path.startsWith('/api/')) { res.writeHead(404).end(); return }
    file = join(dir, 'index.html')
  }
  const headers = { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }
  if (/\/(sw|push-sw)\.js$/.test(path)) headers['cache-control'] = 'public, max-age=0, must-revalidate'
  else if (path.startsWith('/assets/')) headers['cache-control'] = 'public, max-age=31536000, immutable'
  else headers['cache-control'] = 'public, max-age=0, must-revalidate'
  res.writeHead(200, headers).end(await readFile(file))
}).listen(port, '127.0.0.1', () => console.log(`serving ${dir} on ${port}`))
