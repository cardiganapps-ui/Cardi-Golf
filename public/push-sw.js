/* Web push for Polo (PR 8), imported by the generated service worker
   (vite.config.ts workbox.importScripts). Every push shows a notification
   and, when it carries the inbox's count, sets the app badge; a tap opens
   (or focuses) the app on the notice's page. Payload: { title, body, url, tag, badge? }. */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Polo'
  const work = [
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.tag,
      icon: '/icons/icon-192.png',
      // Android draws the badge from its alpha alone: the P on transparent, not the opaque tile (a white square).
      badge: '/icons/badge-96.png',
      data: { url: data.url || '/' },
    }),
  ]
  // A PIN phone's notices carry no count (it has no inbox): the icon keeps whatever it shows.
  if (typeof data.badge === 'number' && self.navigator && 'setAppBadge' in self.navigator) {
    work.push(data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge())
  }
  event.waitUntil(Promise.all(work).catch(() => undefined))
})

/* A page of Polo, whatever the payload says: the server sends no other (safeNoticeUrl), and a tap never
   leaves the app for another site or fails on a link it can't read. */
function noticePage(link) {
  try {
    const url = new URL(link || '/', self.location.origin)
    if (url.origin === self.location.origin) return url.href
  } catch {
    /* not a link: the app's home */
  }
  return new URL('/', self.location.origin).href
}

/* How long a page has to say it moved: one coming back from the background takes a moment to run. */
const ANSWER_MS = 2500

/* Asks the app in `client` to open `url` with its own router; true once it says it did. A page of an older
   build, or one still loading, never answers. */
function askToOpen(client, url) {
  return new Promise((resolve) => {
    let channel
    try {
      channel = new MessageChannel()
    } catch {
      resolve(false)
      return
    }
    const done = (ok) => {
      clearTimeout(timer)
      channel.port1.onmessage = null
      try {
        channel.port1.close()
      } catch {
        /* already closed */
      }
      resolve(ok)
    }
    const timer = setTimeout(() => done(false), ANSWER_MS)
    channel.port1.onmessage = (e) => done(!!(e.data && e.data.ok))
    try {
      client.postMessage({ type: 'navigate', url }, [channel.port2])
    } catch {
      done(false)
    }
  })
}

/* The app the person was using goes to the notice's page through its own router (PWA-12), so nothing
   reloads: a hole half entered on the Tarjeta stays as it was. A full navigation reloaded it, and
   `navigate()` is refused for a page this worker doesn't control. That is the fallback for a page that
   doesn't answer; with no window of the app open, a new one. */
async function openNotice(url) {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const ours = list.filter((c) => {
    try {
      return new URL(c.url).origin === self.location.origin
    } catch {
      return false
    }
  })
  const client = ours.find((c) => c.focused) || ours.find((c) => c.visibilityState === 'visible') || ours[0]
  if (!client) return self.clients.openWindow(url)
  // To the front first: a browser lets a tap's handler focus or open a window only for a moment.
  let target = client
  if ('focus' in client) {
    try {
      target = (await client.focus()) || client
    } catch {
      /* it stays where it is; it can still be asked */
    }
  }
  if (await askToOpen(target, url)) return undefined
  if ('navigate' in target) {
    try {
      await target.navigate(url)
      return undefined
    } catch {
      /* not this worker's page */
    }
  }
  return self.clients.openWindow(url).catch(() => undefined)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = noticePage(event.notification.data && event.notification.data.url)
  event.waitUntil(openNotice(url).catch(() => undefined))
})
