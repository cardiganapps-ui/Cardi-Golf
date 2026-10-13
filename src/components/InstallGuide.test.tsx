// @vitest-environment happy-dom
/**
 * PWA-08: the install guide was not where players arrive (Entrar, En vivo), was the same two-platform list
 * for every device (a laptop too), could be hidden for good with nothing to bring it back, and Android had
 * no one-tap install. PWA-09: on an iPhone the installed app keeps nothing of Safari's.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../i18n/es-MX'
import { useOutbox } from '../data/outbox'
import { useInstallOffer } from '../lib/install'
import { CaptureFromIcon, InstallCard, InstallFirst, InstallRow } from './InstallGuide'

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  laptop: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
}
function device(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
  Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true })
}
function standalone(on: boolean) {
  window.matchMedia = ((q: string) => ({ matches: on && q === '(display-mode: standalone)', media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  localStorage.clear()
  standalone(false)
  useInstallOffer.setState({ offer: null, installed: false })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the card where players arrive (PWA-08)', () => {
  it('an iPhone gets the iPhone’s steps, not Android’s', () => {
    device(UA.iphone)
    render(<InstallCard />)
    expect(screen.getByRole('region', { name: t.install.title })).toBeTruthy()
    expect(screen.getByText(t.install.ios)).toBeTruthy()
    expect(screen.queryByText(t.install.android)).toBeNull()
  })

  it('Android installs in one tap when Chrome offered it, and the menu’s way when it did not', async () => {
    device(UA.android)
    const { unmount } = render(<InstallCard />)
    expect(screen.getByText(t.install.android)).toBeTruthy()
    unmount()
    const prompt = vi.fn(async () => undefined)
    useInstallOffer.setState({ offer: Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' as const }) }) })
    render(<InstallCard />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.install.installButton }))
    })
    expect(prompt).toHaveBeenCalledTimes(1)
  })

  it('a laptop, and the installed app itself, get nothing', () => {
    device(UA.laptop)
    const { container, unmount } = render(<InstallCard />)
    expect(container.textContent).toBe('')
    unmount()
    device(UA.iphone)
    standalone(true)
    expect(render(<InstallCard />).container.textContent).toBe('')
  })

  it('«Ahora no» puts it off for a week; «Ya la tengo» for good', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.parse('2027-04-08T18:00:00Z'))
    device(UA.iphone)
    const first = render(<InstallCard />)
    fireEvent.click(screen.getByRole('button', { name: t.install.later }))
    expect(screen.queryByRole('region', { name: t.install.title })).toBeNull()
    first.unmount()
    vi.setSystemTime(Date.parse('2027-04-14T18:00:00Z'))
    expect(render(<InstallCard />).container.textContent).toBe('')
    cleanup()
    vi.setSystemTime(Date.parse('2027-04-15T18:01:00Z'))
    render(<InstallCard />)
    fireEvent.click(screen.getByRole('button', { name: t.install.done }))
    cleanup()
    vi.setSystemTime(Date.parse('2027-06-01T18:00:00Z'))
    expect(render(<InstallCard />).container.textContent).toBe('')
  })
})

describe('Más keeps the steps, whatever the card was told (PWA-08)', () => {
  it('the row opens this phone’s steps; on a laptop, both phones’ steps, each named', () => {
    device(UA.laptop)
    localStorage.setItem('cardi-golf:install-later', String(Date.now() + 1e9))
    render(<InstallRow />)
    fireEvent.click(screen.getByRole('button', { name: t.install.howTo }))
    const sheet = screen.getByRole('dialog', { name: t.install.howTo })
    expect(sheet.textContent).toContain(t.install.onIphone)
    expect(sheet.textContent).toContain(t.install.ios)
    expect(sheet.textContent).toContain(t.install.onAndroid)
    expect(sheet.textContent).toContain(t.install.android)
  })

  it('inside the installed app there is no row', () => {
    standalone(true)
    expect(render(<InstallRow />).container.textContent).toBe('')
  })
})

describe('an iPhone’s browser (PWA-09)', () => {
  it('Entrar says to install first, with the steps a tap away; once installed, to open it from the icon', () => {
    device(UA.iphone)
    const { unmount } = render(<InstallFirst />)
    expect(screen.getByText(t.install.iosFirst, { exact: false })).toBeTruthy()
    expect(screen.queryByText(t.install.ios)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: t.install.iosFirstHow }))
    expect(screen.getByText(t.install.ios)).toBeTruthy()
    unmount()
    localStorage.setItem('cardi-golf:installed', '1')
    render(<InstallFirst />)
    expect(screen.getByText(t.install.alreadyIos)).toBeTruthy()
  })

  it('the Tarjeta says what is saved there stays in this browser; Android and the installed app say nothing', () => {
    device(UA.iphone)
    const { unmount } = render(<CaptureFromIcon />)
    expect(screen.getByText(t.install.iosCard)).toBeTruthy()
    unmount()
    device(UA.android)
    const a = render(<CaptureFromIcon />)
    expect(a.container.textContent).toBe('')
    a.unmount()
    device(UA.iphone)
    standalone(true)
    expect(render(<CaptureFromIcon />).container.textContent).toBe('')
    expect(render(<InstallFirst />).container.textContent).toBe('')
  })

  it('holes only this browser holds are said out loud: the installed app cannot send them', () => {
    device(UA.iphone)
    useOutbox.setState({ pendingHoles: 3 })
    render(<CaptureFromIcon />)
    expect(screen.getByRole('status').textContent).toBe(t.install.iosCardHeld(3))
    act(() => useOutbox.setState({ pendingHoles: 0 }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText(t.install.iosCard)).toBeTruthy()
  })
})
