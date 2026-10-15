// @vitest-environment happy-dom
/**
 * What a screen reader hears for a field, a switch and a «¿Cómo se calculó?».
 *
 * A11Y-24: `Field` put its hint and error inside the <label>, so they became
 * part of the field's name («Nombre del torneo Así aparece en…»), and nothing
 * was ever marked invalid. `Toggle` did the same with its hint.
 * A11Y-25: a «¿Cómo se calculó?» shown as a figure was named «$6,600» or «?»,
 * with no hint of what it explains or that it explains anything.
 * A11Y-22: «SI» was read «sí», and a switch's radiogroup had no name.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../i18n/es-MX'
import { HowCalculated } from './HowCalculated'
import { NumberField } from './NumberField'
import { Field, Input, ScorecardGrid, Segmented, SiAbbr, type GridHole } from './primitives'
import { Toggle } from './ui'

afterEach(cleanup)

const described = (el: HTMLElement) =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent)

describe('a field is named by its label alone (A11Y-24)', () => {
  it('its hint describes it, and is no part of its name', () => {
    render(
      <Field label="Nombre del torneo" hint="Así aparece en la pantalla de inicio.">
        <Input defaultValue="" />
      </Field>,
    )
    const box = screen.getByRole('textbox', { name: 'Nombre del torneo' })
    expect(described(box)).toEqual(['Así aparece en la pantalla de inicio.'])
    expect(box.getAttribute('aria-invalid')).toBeNull()
  })

  it('an error marks it invalid, describes it in place of the hint, and is said as it appears', () => {
    render(
      <Field label="Nombre del torneo" hint="Así aparece en la pantalla de inicio." error="Escribe un nombre.">
        <Input defaultValue="" />
      </Field>,
    )
    const box = screen.getByRole('textbox', { name: 'Nombre del torneo' })
    expect(box.getAttribute('aria-invalid')).toBe('true')
    expect(described(box)).toEqual(['Escribe un nombre.'])
    expect(screen.getByRole('alert').textContent).toBe('Escribe un nombre.')
    expect(screen.queryByText('Así aparece en la pantalla de inicio.')).toBeNull()
  })

  it('a number box is one field too, and keeps a description of its own', () => {
    render(
      <>
        <span id="own">Antes del IVA.</span>
        <Field label="Inscripción" hint="Por jugador.">
          <NumberField label="Inscripción" value={2500} onChange={vi.fn()} aria-describedby="own" />
        </Field>
      </>,
    )
    const box = screen.getByRole('textbox', { name: 'Inscripción' })
    expect(described(box)).toEqual(['Antes del IVA.', 'Por jugador.'])
  })

  it('a switch inside is a group named by the label, never a label that hands its words to the first button', () => {
    render(
      <Field label="Días" hint="Se cambian después.">
        <Segmented
          value="1"
          options={[
            { value: '1', label: '1' },
            { value: '2', label: '2' },
          ]}
          onChange={vi.fn()}
        />
      </Field>,
    )
    const group = screen.getByRole('group', { name: 'Días' })
    expect(described(group)).toEqual(['Se cambian después.'])
    expect(document.querySelector('label')).toBeNull()
    expect(screen.getByRole('radio', { name: '1' })).toBeTruthy()
  })
})

describe('a switch is named by its words, its hint describes it (A11Y-24)', () => {
  it('Toggle', () => {
    render(<Toggle label="Vibrar al capturar" hint="Solo en este teléfono." checked onChange={vi.fn()} />)
    const box = screen.getByRole('checkbox', { name: 'Vibrar al capturar' })
    expect(described(box)).toEqual(['Solo en este teléfono.'])
  })

  it('a label said otherwise still wins', () => {
    render(<Toggle label="Con dinero" ariaLabel="Torneo con dinero" checked={false} onChange={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: 'Torneo con dinero' })).toBeTruthy()
  })
})

describe('«¿Cómo se calculó?» says what it explains (A11Y-25)', () => {
  const why = { title: 'Campeón', steps: [] } as never
  it('an amount is said with what it pays and that it explains it', () => {
    render(<HowCalculated why={why} label="$6,600" about="Campeón" />)
    expect(screen.getByRole('button', { name: 'Campeón, $6,600: ¿Cómo se calculó?' }).textContent).toBe('$6,600')
  })
  it('a «?» is never said as «?»', () => {
    render(<HowCalculated why={why} label="?" about="Diego, juega 14" />)
    expect(screen.getByRole('button', { name: 'Diego, juega 14: ¿Cómo se calculó?' })).toBeTruthy()
  })
  it('the words alone stay the words', () => {
    render(<HowCalculated why={why} />)
    expect(screen.getByRole('button', { name: t.money.howCalculated })).toBeTruthy()
  })
})

describe('«SI» is said as words (A11Y-22)', () => {
  it('SiAbbr reads «índice de golpe», and shows «SI»', () => {
    render(
      <table>
        <tbody>
          <tr>
            <th scope="row">
              <SiAbbr />
            </th>
            <td>7</td>
          </tr>
        </tbody>
      </table>,
    )
    const head = screen.getByRole('rowheader', { name: t.player.siSpoken })
    expect(head.querySelector('[aria-hidden="true"]')!.textContent).toBe('SI')
  })

  it('the player sheet’s card heads its index row in words', () => {
    const holes: GridHole[] = Array.from({ length: 9 }, (_, i) => ({ n: i + 1, par: 4, si: i + 1, gross: 4, pts: 2, putts: 2 }))
    render(<ScorecardGrid holes={holes} playerLabel="Camilo" showPoints showPutts onHole={vi.fn()} />)
    expect(screen.getByRole('rowheader', { name: t.player.siSpoken })).toBeTruthy()
    expect(screen.queryByRole('rowheader', { name: 'SI' })).toBeNull()
  })
})
