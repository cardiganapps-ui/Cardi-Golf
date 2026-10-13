/**
 * ARCH-09: the snapshot ordered `team_members` by an `id` column it doesn't
 * have, PostgREST answered 400, and every tournament with a saved team draw
 * stopped loading. Each table the snapshot pages through must be ordered by
 * its real primary key, as declared in the migrations.
 */
import { describe, expect, it } from 'vitest'
import { SNAPSHOT_KEYS } from './snapshotTables'
import { primaryKeys } from './testing/migrationKeys'

describe('snapshot tables', () => {
  const pk = primaryKeys()

  it('finds the tables in the migrations', () => {
    expect(pk.size).toBeGreaterThan(30)
  })

  it.each(Object.entries(SNAPSHOT_KEYS))('orders %s by its primary key', (table, key) => {
    expect(pk.get(table), `${table} has no create table block with a primary key`).toBeDefined()
    expect([...key]).toEqual(pk.get(table))
  })
})
