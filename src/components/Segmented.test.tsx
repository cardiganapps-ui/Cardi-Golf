// @vitest-environment happy-dom
/**
 * A11Y-17: the choice control is one Tab stop; the arrow keys, Home and End
 * move among its options and choose as they go; as tabs it names the panel it
 * controls, and that panel is labelled by the chosen tab.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Segmented } from './primitives'

afterEach(cleanup)

const OPTIONS = [
  { value: 'a', label: 'Día 1' },
  { value: 'b', label: 'Día 2' },
  { value: 'c', label: 'Día 3' },
] as const

function Harness({ tabs }: { tabs?: boolean }) {
  const [v, setV] = useState<'a' | 'b' | 'c'>('a')
  return (
    <>
      <Segmented value={v} options={[...OPTIONS]} onChange={setV} tabs={tabs} label="Qué día" panelId={tabs ? 'panel' : undefined} />
      {tabs && <div role="tabpanel" id="panel" aria-labelledby={`panel-tab-${v}`} />}
    </>
  )
}

describe('Segmented (A11Y-17)', () => {
  it('a radio group with one Tab stop, the checked option', () => {
    render(<Harness />)
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1])
    expect(screen.getByRole('radio', { checked: true }).textContent).toBe('Día 1')
  })

  it('arrows move and choose, wrapping; Home and End go to the ends', async () => {
    render(<Harness />)
    const at = () => screen.getByRole('radio', { checked: true })
    await act(async () => fireEvent.keyDown(at(), { key: 'ArrowRight' }))
    expect(at().textContent).toBe('Día 2')
    expect(document.activeElement).toBe(at())
    await act(async () => fireEvent.keyDown(at(), { key: 'End' }))
    expect(at().textContent).toBe('Día 3')
    await act(async () => fireEvent.keyDown(at(), { key: 'ArrowDown' }))
    expect(at().textContent).toBe('Día 1')
    await act(async () => fireEvent.keyDown(at(), { key: 'ArrowLeft' }))
    expect(at().textContent).toBe('Día 3')
    await act(async () => fireEvent.keyDown(at(), { key: 'Home' }))
    expect(at().textContent).toBe('Día 1')
    expect(screen.getAllByRole('radio').map((r) => r.tabIndex)).toEqual([0, -1, -1])
  })

  it('as tabs, each tab controls the panel and the panel is named by the chosen one', async () => {
    render(<Harness tabs />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.every((x) => x.getAttribute('aria-controls') === 'panel')).toBe(true)
    await act(async () => fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' }))
    expect(screen.getByRole('tabpanel', { name: 'Día 2' })).toBeTruthy()
  })

  /** VIS-26: the strip keeps the chosen tab in view, at once the first time, then smooth unless less motion is asked for. */
  for (const reduce of [false, true]) {
    it(`as tabs, brings the chosen tab into view${reduce ? ', at once under reduced motion' : ''}`, async () => {
      const scrollTo = vi.fn()
      const spy = vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(scrollTo)
      const media = vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList)
      render(<Harness tabs />)
      expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'auto' }))
      await act(async () => fireEvent.click(screen.getAllByRole('tab')[2]!))
      expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: reduce ? 'auto' : 'smooth' }))
      spy.mockRestore()
      media.mockRestore()
    })
  }
})
