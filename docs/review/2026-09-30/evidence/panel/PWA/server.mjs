import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve(process.argv[2] || 'site')
const port = Number(process.argv[3] || 4193)
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  let p = path.join(root, decodeURIComponent(u.pathname))
  if (!p.startsWith(root)) { res.writeHead(403); return res.end() }
  let isFile = false
  try { isFile = fs.statSync(p).isFile() } catch {}
  if (!isFile) {
    if (u.pathname.startsWith('/assets/')) { res.writeHead(404); return res.end('nf') }
    p = path.join(root, 'index.html')
  }
  const ext = path.extname(p)
  res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'cache-control': u.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' })
  fs.createReadStream(p).pipe(res)
}).listen(port, '127.0.0.1', () => console.log('serving', root, 'on', port))
