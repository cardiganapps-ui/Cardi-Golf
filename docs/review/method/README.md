# How the panel review is run

The method behind `docs/review/2026-09-30/`, kept so the gate re-reviews in `docs/quality/PLAN.md` (G1–G4) use the same brief and are graded the same way.

- `PANEL_BRIEF.md`: the brief every panelist gets, covering the owner's bar, rules, severity, grading anchors and output format.
- `VERIFY_BRIEF.md`: the brief for adversarial verifiers of every P0/P1.
- `tools/`: the chair's scripts, in pipeline order:
  1. merge the panel's findings (`merge-findings.mjs`);
  2. batch them for verification (`make-batches.mjs`);
  3. apply the verdicts and the chair's rulings (`finalize.mjs`);
  4. make the public-safe copy (`make-public.mjs`);
  5. render the report (`render-findings.mjs`, `render-history.mjs`, `assemble.mjs`);
  6. build the private page (`build-page.mjs`);
  7. compress screenshots (`compress-png.mjs`).

  They read and write under a scratch directory (`$S`); point `S` at a fresh scratch folder before reusing them.

**For a blind re-review (G4):**
- Give the panel the same `PANEL_BRIEF.md`, updated only for dates and environment.
- Tell panelists not to read `docs/quality/` or `docs/review/`, so they judge the product and not the ledger's claims.
- List the owner's accepted residuals (paid alternatives Diego declined) so they aren't re-filed as new findings.
