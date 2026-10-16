/**
 * The tree stays light (QA-20). design/shots held 64 MB of screenshot sets
 * that every clone and CI checkout downloaded, and each design pass added
 * another. They left the tree on 2026-10-16 (in git at commit af36474). This
 * holds the line: under design/shots only the style guide's set is tracked,
 * no tracked image or video is over 512 KB (the first tournament's logo is the
 * one exception, the file the Comité uploads), and all of them together stay
 * under 26 MB (the 2026-09-30 review's screenshots are most of it). A set to
 * share goes out as a CI artifact or a link, never a commit.
 */
import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const MEDIA = /\.(png|jpe?g|webp|gif|avif|mp4|webm|mov|pdf)$/i
const MAX_FILE = 512 * 1024
const MAX_TOTAL = 26 * 1024 * 1024
/** Files allowed over MAX_FILE, with why. */
const BIG_ON_PURPOSE: Record<string, string> = {
  'assets/nacho-logo.png': 'the first tournament’s logo as Diego sent it; the Comité uploads it and Polo stores a rendition (§7 «Images before upload»)',
}

/** What git tracks (the index), or null outside a git checkout. */
function tracked(): string[] | null {
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
  } catch {
    return null
  }
}

const files = tracked()

describe.skipIf(!files)('what the tree carries', () => {
  const media = (files ?? []).filter((f) => MEDIA.test(f)).map((f) => {
    let size = 0
    try {
      size = statSync(join(root, f)).size
    } catch {
      // Deleted in the working tree, not yet in the index: it weighs nothing here.
    }
    return { f, size }
  })

  it('keeps only the style guide’s screenshots under design/shots', () => {
    expect((files ?? []).filter((f) => f.startsWith('design/shots/') && !f.startsWith('design/shots/design/'))).toEqual([])
  })

  it('has no image or video over 512 KB but the ones named here', () => {
    expect(media.filter((m) => m.size > MAX_FILE && !(m.f in BIG_ON_PURPOSE)).map((m) => `${m.f}: ${Math.round(m.size / 1024)} KB`)).toEqual([])
  })

  it('carries under 26 MB of images and video in all', () => {
    const total = media.reduce((sum, m) => sum + m.size, 0)
    expect(total, `${(total / 1024 / 1024).toFixed(1)} MB`).toBeLessThan(MAX_TOTAL)
  })
})
