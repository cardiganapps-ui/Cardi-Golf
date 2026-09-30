// Tiny static server for the deploy experiment: serves <root>/current (a symlink), SPA fallback like
// vercel.json (`/((?!api/).*)` → /index.html for anything that is not a file), sw.js uncached.
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
const root = process.argv[2]
const port = Number(process.argv[3] ?? 4185)
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.json': 'application/json' }
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const dir = path.join(root, 'current')
  let file = path.join(dir, decodeURIComponent(url.pathname))
  let ok = false
  try { ok = (await stat(file)).isFile() } catch {}
  if (!ok) file = path.join(dir, 'index.html')
  const ext = path.extname(file)
  const headers = { 'Content-Type': types[ext] ?? 'application/octet-stream' }
  if (/sw\.js$|index\.html$|push-sw\.js$/.test(file)) headers['Cache-Control'] = 'public, max-age=0, must-revalidate'
  else if (/\/assets\//.test(file)) headers['Cache-Control'] = 'public, max-age=31536000, immutable'
  try {
    const body = await readFile(file)
    res.writeHead(200, headers).end(body)
  } catch (e) {
    res.writeHead(500).end(String(e))
  }
}).listen(port, '127.0.0.1', () => console.log('serving', root, 'on', port))
