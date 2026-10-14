// @vitest-environment happy-dom
/**
 * Push on this device (src/data/push.ts): an account's address (0019) and a PIN phone's, for the player it
 * holds (0052, PWA-10). PWA-12's rough edges: an iPad read as «this browser takes no notices» (iPadOS Safari
 * sends a Mac's user agent), the blocked copy sent the installed iPhone app to browser settings it has none of,
 * and the icon's count followed nothing but Avisos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const maybeSingle = vi.fn()
const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }))
vi.mock('../lib/supabase', () => ({ supabaseConfigured: true, supabase: () => ({ rpc, from }), authSettings: async () => null }))

const { ACCOUNT, deniedHelp, disablePush, enablePush, pushState, startBadgeSync, unsupportedHelp, usePushFixture, _pushTest } = await import('./push')
const { useAuth } = await import('./auth')
const { useUnread } = await import('./social')
const { t } = await import('../i18n/es-MX')

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
/** iPadOS Safari asks for the desktop site: a Mac's user agent, with a touch screen. */
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
const LAPTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
const ENDPOINT = 'https://push.test/this-phone'

const sub = { endpoint: ENDPOINT, toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p256', auth: 'auth' } }), unsubscribe: vi.fn(async () => true) }
const pushManager = { getSubscription: vi.fn(async () => null as typeof sub | null), subscribe: vi.fn(async () => sub) }
const badge = { set: vi.fn(async () => undefined), clear: vi.fn(async () => undefined) }

/** This phone: its user agent, a touch screen or not, opened from the icon or not, and what its browser has. */
function phone(o: { ua: string; touch?: number; standalone?: boolean; push?: boolean; permission?: NotificationPermission; subscribed?: boolean }) {
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'BAAA')
  Object.defineProperty(navigator, 'userAgent', { value: o.ua, configurable: true })
  Object.defineProperty(navigator, 'maxTouchPoints', { value: o.touch ?? 0, configurable: true })
  Object.defineProperty(navigator, 'serviceWorker', { value: { getRegistration: async () => ({ pushManager }), ready: Promise.resolve({ pushManager }) }, configurable: true })
  Object.defineProperty(navigator, 'setAppBadge', { value: badge.set, configurable: true })
  Object.defineProperty(navigator, 'clearAppBadge', { value: badge.clear, configurable: true })
  window.matchMedia = ((q: string) => ({ matches: !!o.standalone && q.includes('standalone'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
  if (o.push === false) {
    vi.stubGlobal('PushManager', undefined)
    delete (window as { PushManager?: unknown }).PushManager
  } else vi.stubGlobal('PushManager', function PushManager() {})
  vi.stubGlobal('Notification', { permission: o.permission ?? 'default', requestPermission: vi.fn(async () => o.permission ?? 'granted') })
  pushManager.getSubscription.mockResolvedValue(o.subscribed ? sub : null)
}
const PLAYER = { kind: 'player', tournamentId: 't1' } as const

beforeEach(() => {
  rpc.mockReset()
  maybeSingle.mockReset()
  sub.unsubscribe.mockClear()
  pushManager.subscribe.mockClear()
  badge.set.mockClear()
  badge.clear.mockClear()
  usePushFixture.setState({ state: null })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('which phone this is (PWA-12)', () => {
  it('an iPad in Safari is an iPhone’s case: the app on the home screen first, not «no notices here»', async () => {
    phone({ ua: IPAD, touch: 5, push: false })
    expect(await pushState()).toBe('needsInstall')
    expect(await pushState(PLAYER)).toBe('needsInstall')
  })

  it('an iPhone in Safari too; installed, it takes them; too old for them, it says what it needs', async () => {
    phone({ ua: IPHONE, touch: 5 })
    expect(await pushState()).toBe('needsInstall')
    phone({ ua: IPHONE, touch: 5, standalone: true })
    expect(await pushState()).toBe('off')
    phone({ ua: IPHONE, touch: 5, standalone: true, push: false })
    expect(await pushState()).toBe('unsupported')
    expect(unsupportedHelp()).toBe(t.push.unsupportedIos)
  })

  it('a Mac without a touch screen is a computer: its browser takes them where it can', async () => {
    phone({ ua: IPAD, touch: 0 })
    expect(await pushState()).toBe('off')
    phone({ ua: LAPTOP, push: false })
    expect(await pushState()).toBe('unsupported')
    expect(unsupportedHelp()).toBe(t.push.unsupported)
  })

  it('blocked: where this phone undoes it', async () => {
    phone({ ua: IPHONE, touch: 5, standalone: true, permission: 'denied' })
    expect(await pushState()).toBe('denied')
    expect(deniedHelp()).toBe(t.push.deniedIos)
    phone({ ua: ANDROID, touch: 5, standalone: true, permission: 'denied' })
    expect(deniedHelp()).toBe(t.push.deniedAndroidApp)
    phone({ ua: ANDROID, touch: 5, permission: 'denied' })
    expect(deniedHelp()).toBe(t.push.deniedAndroid)
    phone({ ua: LAPTOP, permission: 'denied' })
    expect(deniedHelp()).toBe(t.push.denied)
    // The browser's settings were the installed iPhone app's advice, which has none.
    expect(t.push.deniedIos).not.toMatch(/navegador/)
    expect(t.push.deniedIos).toMatch(/Ajustes/)
  })
})

describe('on or off, as the browser and the server have it', () => {
  it('the account: on only when its row has this browser’s address; with no signal, the browser’s word', async () => {
    phone({ ua: ANDROID, touch: 5, permission: 'granted', subscribed: true })
    maybeSingle.mockResolvedValueOnce({ data: { endpoint: ENDPOINT }, error: null })
    expect(await pushState(ACCOUNT)).toBe('on')
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    expect(await pushState(ACCOUNT)).toBe('off')
    maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
    expect(await pushState(ACCOUNT)).toBe('on')
  })

  it('a PIN phone: on only while the server says its address hears the player it holds', async () => {
    phone({ ua: ANDROID, touch: 5, permission: 'granted', subscribed: true })
    rpc.mockResolvedValueOnce({ data: true, error: null })
    expect(await pushState(PLAYER)).toBe('on')
    expect(rpc).toHaveBeenLastCalledWith('pin_push_on', { p_tournament_id: 't1', p_endpoint: ENDPOINT })
    // The phone took another player: the server dropped its address.
    rpc.mockResolvedValueOnce({ data: false, error: null })
    expect(await pushState(PLAYER)).toBe('off')
  })

  it('no address in this browser yet, or no permission: off, without asking the server', async () => {
    phone({ ua: ANDROID, touch: 5, permission: 'default', subscribed: false })
    expect(await pushState(PLAYER)).toBe('off')
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('turning them on and off', () => {
  it('a PIN phone saves its address for the player it holds; an account for itself', async () => {
    phone({ ua: ANDROID, touch: 5, permission: 'granted' })
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await enablePush(PLAYER)).toBe('on')
    expect(rpc).toHaveBeenLastCalledWith('save_pin_push', { p_tournament_id: 't1', p_endpoint: ENDPOINT, p_p256dh: 'p256', p_auth: 'auth', p_user_agent: ANDROID })
    expect(await enablePush(ACCOUNT)).toBe('on')
    expect(rpc).toHaveBeenLastCalledWith('save_push_subscription', { p_endpoint: ENDPOINT, p_p256dh: 'p256', p_auth: 'auth', p_user_agent: ANDROID })
  })

  it('a refusal at the prompt saves nothing; a refusal at the server says why', async () => {
    phone({ ua: ANDROID, touch: 5, permission: 'denied' })
    expect(await enablePush(PLAYER)).toBe('denied')
    expect(rpc).not.toHaveBeenCalled()
    phone({ ua: ANDROID, touch: 5, permission: 'granted' })
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Entra con tu PIN para recibir los avisos del torneo' } })
    await expect(enablePush(PLAYER)).rejects.toThrow('Entra con tu PIN para recibir los avisos del torneo')
  })

  it('off takes the browser’s address too, unless the other one still hears through it', async () => {
    phone({ ua: ANDROID, touch: 5, permission: 'granted', subscribed: true })
    rpc.mockResolvedValue({ data: null, error: null })
    // The PIN player's off, while this browser is also the account's: the address stays for the account.
    maybeSingle.mockResolvedValueOnce({ data: { endpoint: ENDPOINT }, error: null })
    expect(await disablePush(PLAYER)).toBe('off')
    expect(rpc).toHaveBeenCalledWith('delete_pin_push', { p_endpoint: ENDPOINT })
    expect(sub.unsubscribe).not.toHaveBeenCalled()
    // …and with no account behind it, the browser lets it go.
    maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    await disablePush(PLAYER)
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1)
    // The account's off, while a PIN player still hears through this browser (in any tournament): kept.
    rpc.mockImplementation(async (fn: string) => ({ data: fn === 'pin_push_on' ? true : null, error: null }))
    await disablePush(ACCOUNT)
    expect(rpc).toHaveBeenCalledWith('delete_push_subscription', { p_endpoint: ENDPOINT })
    expect(rpc).toHaveBeenCalledWith('pin_push_on', { p_tournament_id: null, p_endpoint: ENDPOINT })
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('the design fixtures: the state they set, and on and off only flip it', async () => {
    usePushFixture.setState({ state: 'off' })
    expect(await pushState(PLAYER)).toBe('off')
    expect(await enablePush(PLAYER)).toBe('on')
    expect(usePushFixture.getState().state).toBe('on')
    expect(await disablePush(PLAYER)).toBe('off')
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('the icon’s count follows the inbox (PWA-12)', () => {
  it('set from the unread count on start and each time the app comes back; a phone with no account shows none', async () => {
    phone({ ua: ANDROID, touch: 5 })
    _pushTest.resetBadgeSync()
    let unread = 4
    rpc.mockImplementation(async (fn: string) => ({ data: fn === 'unread_notifications' ? unread : null, error: null }))
    useAuth.setState({ ready: true, user: { id: 'u1', is_anonymous: false } as never, isAnonymous: false })
    startBadgeSync()
    await vi.waitFor(() => expect(badge.set).toHaveBeenLastCalledWith(4))
    // Read elsewhere (the inbox on another phone): the next return to the front clears it.
    unread = 0
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(badge.clear).toHaveBeenCalled())
    // A new notice while the app is open: the count moves, the icon with it.
    useUnread.setState({ count: 2 })
    expect(badge.set).toHaveBeenLastCalledWith(2)
    // Signed out to a PIN phone: no inbox, no count.
    badge.clear.mockClear()
    useAuth.setState({ user: { id: 'anon', is_anonymous: true } as never, isAnonymous: true })
    await vi.waitFor(() => expect(badge.clear).toHaveBeenCalled())
  })
})
