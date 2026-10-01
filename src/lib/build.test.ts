import { describe, expect, it } from 'vitest'
import { BUILD, belowMinBuild, buildLabel } from './build'

describe('build identity (PWA-03)', () => {
  it('every build carries a numeric id and a commit', () => {
    expect(Number.isInteger(BUILD.id)).toBe(true)
    expect(BUILD.id).toBeGreaterThan(1_700_000_000)
    expect(BUILD.sha.length).toBeGreaterThan(0)
  })

  it('only a number above this build asks for an update', () => {
    expect(belowMinBuild(undefined, 100)).toBe(false)
    expect(belowMinBuild(null, 100)).toBe(false)
    expect(belowMinBuild('200', 100)).toBe(false)
    expect(belowMinBuild(Number.NaN, 100)).toBe(false)
    expect(belowMinBuild(100, 100)).toBe(false)
    expect(belowMinBuild(99, 100)).toBe(false)
    expect(belowMinBuild(101, 100)).toBe(true)
  })

  it('the label names the moment and the commit', () => {
    expect(buildLabel({ id: Date.UTC(2026, 9, 1, 12, 0) / 1000, sha: 'abc1234' })).toMatch(/2026.*· abc1234$/)
  })
})
