/**
 * QA-10: `main` has no branch protection on the free plan, so the guards
 * Claude runs are what keep it clean:
 * - the PreToolUse push guard refuses a push to main, and runs the preflight
 *   in the tree being pushed (a worktree's push was once checked against the
 *   main checkout and went out red);
 * - the GitHub MCP write tools cannot commit to main;
 * - the git pre-push hook refuses main for any client, and the session wires it.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const tmp = mkdtempSync(join(tmpdir(), 'polo-guards-'))
const onMain = join(tmp, 'on-main')
const onBranch = join(tmp, 'on-branch')
const marker = join(tmp, 'preflight-ran-in')

function git(dir: string, ...args: string[]) {
  const r = spawnSync('git', ['-C', dir, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
}
beforeAll(() => {
  for (const [dir, branch] of [
    [onMain, 'main'],
    [onBranch, 'claude/topic'],
  ] as const) {
    spawnSync('git', ['init', '-q', '-b', branch, dir])
    git(dir, 'commit', '-q', '--allow-empty', '-m', 'x')
  }
})
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

function pushGuard(command: string, preflight = `pwd > ${marker}`) {
  rmSync(marker, { force: true })
  const r = spawnSync('bash', [join(ROOT, 'scripts/prepush-guard.sh')], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: onBranch, PREPUSH_PREFLIGHT: preflight, PREPUSH_LOG: join(tmp, 'log') },
  })
  let ranIn: string | null = null
  try {
    ranIn = readFileSync(marker, 'utf8').trim()
  } catch {
    ranIn = null
  }
  return { code: r.status, stderr: r.stderr, ranIn }
}

describe('the push guard', () => {
  it('lets anything that is not a push through untouched', () => {
    expect(pushGuard('git status && npm test')).toEqual({ code: 0, stderr: '', ranIn: null })
  })

  it.each(['git push origin main', 'git push -u origin HEAD:main', 'git push origin +refs/heads/main', 'git push --all', `cd ${onMain} && git push`, `git -C ${onMain} push origin HEAD`])(
    'refuses %s',
    (command) => {
      const r = pushGuard(command)
      expect(r.code).toBe(2)
      expect(r.stderr).toMatch(/main|--all/)
      expect(r.ranIn).toBeNull()
    },
  )

  it('runs the preflight in the tree being pushed', () => {
    expect(pushGuard(`cd ${onBranch} && git push -u origin claude/topic`)).toMatchObject({ code: 0, ranIn: onBranch })
    expect(pushGuard(`git -C ${onBranch} push -u origin claude/topic`)).toMatchObject({ code: 0, ranIn: onBranch })
    expect(pushGuard(`cd ${onMain} && cd ${onBranch} && git push origin claude/topic`)).toMatchObject({ code: 0, ranIn: onBranch })
  })

  it('blocks the push when that preflight fails', () => {
    const r = pushGuard(`cd ${onBranch} && git push -u origin claude/topic`, 'echo "✗ test" && exit 1')
    expect(r.code).toBe(2)
    expect(r.stderr).toContain(`preflight failed in ${onBranch}`)
    expect(r.stderr).toContain('✗ test')
  })
})

describe('the GitHub MCP write guard', () => {
  const run = (tool_input: Record<string, unknown>) =>
    spawnSync('python3', [join(ROOT, 'scripts/mcp-main-guard.py')], { input: JSON.stringify({ tool_name: 'mcp__github__push_files', tool_input }), encoding: 'utf8' }).status

  it('refuses main and the default branch', () => {
    expect(run({ branch: 'main', files: [] })).toBe(2)
    expect(run({ files: [] })).toBe(2)
  })
  it('allows a topic branch', () => {
    expect(run({ branch: 'claude/topic', files: [] })).toBe(0)
  })
})

describe('the git pre-push hook', () => {
  it('refuses a push whose remote ref is main, before any preflight', () => {
    const r = spawnSync('bash', [join(ROOT, '.githooks/pre-push')], { cwd: onBranch, input: 'refs/heads/claude/topic abc refs/heads/main def\n', encoding: 'utf8' })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('never push to main')
  })
})

describe('the session wires every guard', () => {
  const settings = JSON.parse(readFileSync(join(ROOT, '.claude/settings.json'), 'utf8')) as {
    hooks: Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>
    permissions: { deny: string[] }
  }
  it('runs the push guard on Bash and the write guard on the GitHub MCP writes', () => {
    const pre = settings.hooks.PreToolUse!
    expect(pre.find((h) => h.matcher === 'Bash')!.hooks[0]!.command).toContain('prepush-guard.sh')
    const mcp = pre.find((h) => h.matcher?.includes('mcp__github__push_files'))!
    for (const tool of ['push_files', 'create_or_update_file', 'delete_file']) expect(mcp.matcher).toContain(`mcp__github__${tool}`)
    expect(mcp.hooks[0]!.command).toContain('mcp-main-guard.py')
  })
  it('wires the git hooks at session start, and force-push stays denied', () => {
    expect(settings.hooks.SessionStart![0]!.hooks[0]!.command).toContain('core.hooksPath .githooks')
    expect(settings.permissions.deny.some((d) => d.includes('--force'))).toBe(true)
  })
})
