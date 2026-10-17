/**
 * VIS-18: Entrar's faces, the first screen every player sees. 88 px grey initials dominated 170 px tiles while the
 * names were 14 px, every disc was the same grey, and only 9 of 12 fitted on an iPhone 15 Pro. Now the name is the
 * primary element (16 px or more, weight 600), a player with no photo has a tinted monogram of his own, and twelve
 * faces fit above the fold of a 375×667 phone. Each face keeps its name as A11Y-24 says it.
 */
import { expect, open, test } from './base'

for (const [width, height] of [
  [375, 667],
  [393, 852],
] as const) {
  test(`twelve faces fit above the fold, the name leads at ${width}×${height} (VIS-18)`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await open(page, '/t/_/full12-live?as=new-phone')
    const faces = page.locator('button[class*="_face_"]')
    await expect(faces).toHaveCount(12)
    const box = await faces.last().boundingBox()
    expect(box, 'the twelfth face').not.toBeNull()
    expect(box!.y + box!.height, 'the twelfth face ends above the fold').toBeLessThanOrEqual(height)
    const looks = await faces.evaluateAll((els) =>
      els.map((el) => {
        const name = el.querySelector('[class*="_faceName_"]')!
        const s = getComputedStyle(name)
        const avatar = el.querySelector<HTMLElement>('.avatar')!
        const a = avatar.getBoundingClientRect()
        return { size: parseFloat(s.fontSize), weight: Number(s.fontWeight), nameHeight: name.getBoundingClientRect().height, avatar: Math.max(a.width, a.height), fill: getComputedStyle(avatar).backgroundColor }
      }),
    )
    for (const l of looks) {
      expect(l.size, 'the name is 16 px or more').toBeGreaterThanOrEqual(16)
      expect(l.weight, 'the name is set at 600').toBeGreaterThanOrEqual(600)
      expect(l.avatar, 'the face is smaller than the name leads').toBeLessThanOrEqual(48)
    }
    // Twelve monograms, not one grey: at least five fills among them.
    expect(new Set(looks.map((l) => l.fill)).size).toBeGreaterThanOrEqual(5)
    // A11Y-24: the face is named by its name, its category and the honoree.
    await expect(faces.first()).toHaveAccessibleName(/^[^,]+, categoría [A-Z]/)
    expect(await page.getByRole('button', { name: /homenajeado$/ }).count()).toBeGreaterThanOrEqual(1)
  })
}
