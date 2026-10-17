import { describe, expect, it } from 'vitest'
import { localWhen } from './localWhen'
import { t } from '../i18n/es-MX'

describe('localWhen', () => {
  it('reads the moment in the tournament’s zone, not the phone’s', () => {
    // 03:14 UTC on the 9th is still the 8th in Los Cabos (UTC−7 all year since 2022).
    expect(localWhen('2027-04-09T03:14:00Z', 'America/Mazatlan')).toBe('8 abr 2027, 20:14')
    expect(localWhen('2027-04-09T03:14:00Z', 'UTC')).toBe('9 abr 2027, 03:14')
  })
  it('on the 24-hour clock, so a sentence that goes on after it never reads «p.m..»', () => {
    expect(t.admin.players.lock.fixed(localWhen('2027-04-09T03:14:00Z', 'America/Mazatlan'))).toBe(
      'Fijados el 8 abr 2027, 20:14. Cambiar uno pide un motivo, y todos lo ven en En vivo.',
    )
  })
  it('an unknown zone falls back to the phone’s; an unreadable time comes back as it was', () => {
    expect(localWhen('2027-04-09T03:14:00Z', 'Marte/Olimpo')).toMatch(/2027/)
    expect(localWhen('ayer', 'America/Mazatlan')).toBe('ayer')
  })
})
