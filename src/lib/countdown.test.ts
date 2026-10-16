/** STRAT-10: the countdown to the first tee reads the tournament's own clock, whatever the phone's. */
import { describe, expect, it } from 'vitest'
import { untilDay, zonedDate, zonedInstant } from './countdown'

const MAZ = 'America/Mazatlan'

describe('zonedInstant', () => {
  it('reads a date and tee time in the tournament’s zone', () => {
    // Mazatlán is UTC−7 all year since 2022.
    expect(new Date(zonedInstant('2027-04-09', '09:00', MAZ)!).toISOString()).toBe('2027-04-09T16:00:00.000Z')
    expect(new Date(zonedInstant('2027-04-09', null, MAZ)!).toISOString()).toBe('2027-04-09T07:00:00.000Z')
  })
  it('lands right across a change of clocks', () => {
    // Mexico City kept no DST in 2027; New York moves on 14 March 2027.
    expect(new Date(zonedInstant('2027-03-14', '09:00', 'America/New_York')!).toISOString()).toBe('2027-03-14T13:00:00.000Z')
    expect(new Date(zonedInstant('2027-03-13', '09:00', 'America/New_York')!).toISOString()).toBe('2027-03-13T14:00:00.000Z')
  })
  it('refuses a date it can’t read, and an unknown zone reads as UTC', () => {
    expect(zonedInstant('9 de abril', '09:00', MAZ)).toBeNull()
    expect(new Date(zonedInstant('2027-04-09', '09:00', 'Nowhere/Never')!).toISOString()).toBe('2027-04-09T09:00:00.000Z')
  })
})

describe('untilDay', () => {
  const at = (iso: string) => Date.parse(iso)
  it('counts calendar days in the zone, not 24-hour blocks', () => {
    expect(untilDay('2027-04-09', '09:00', MAZ, at('2027-03-30T18:00:00Z'))).toEqual({ unit: 'days', n: 10 })
    // 11 p.m. in Mazatlán the night before is «mañana», though it is already the 9th in UTC.
    expect(untilDay('2027-04-09', '09:00', MAZ, at('2027-04-09T06:00:00Z'))).toEqual({ unit: 'tomorrow' })
    expect(zonedDate(at('2027-04-09T06:00:00Z'), MAZ)).toBe('2027-04-08')
  })
  it('on the day: hours and minutes to the tee time, then started', () => {
    expect(untilDay('2027-04-09', '09:00', MAZ, at('2027-04-09T13:25:00Z'))).toEqual({ unit: 'today', hours: 2, minutes: 35 })
    expect(untilDay('2027-04-09', '09:00', MAZ, at('2027-04-09T16:00:00Z'))).toEqual({ unit: 'started' })
    expect(untilDay('2027-04-09', null, MAZ, at('2027-04-09T13:25:00Z'))).toEqual({ unit: 'today', hours: null, minutes: null })
  })
  it('a day gone by has started', () => {
    expect(untilDay('2027-04-09', '09:00', MAZ, at('2027-04-11T13:25:00Z'))).toEqual({ unit: 'started' })
  })
})
