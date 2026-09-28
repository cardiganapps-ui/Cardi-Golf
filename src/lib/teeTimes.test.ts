import { describe, expect, it } from 'vitest'
import { withTeeTimes } from './teeTimes'

describe('withTeeTimes', () => {
  it('carries minutes into the hour', () => {
    expect(withTeeTimes('09:00', 8)).toEqual(['09:00', '09:10', '09:20', '09:30', '09:40', '09:50', '10:00', '10:10'])
  })
  it('defaults to 09:00 and accepts seconds in the input', () => {
    expect(withTeeTimes('', 2)).toEqual(['09:00', '09:10'])
    expect(withTeeTimes('08:45:00', 2, 15)).toEqual(['08:45', '09:00'])
  })
})
