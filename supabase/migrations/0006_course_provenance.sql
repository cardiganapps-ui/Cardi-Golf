-- Cardi-Golf · 0006 · course provenance for imported data (§13b-A):
-- ODbL attribution (OpenGolfAPI), website and coordinates.
alter table public.courses
  add column if not exists attribution text,
  add column if not exists website text,
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6);
alter table public.courses drop constraint if exists courses_source_check;
alter table public.courses add constraint courses_source_check
  check (source in ('manual', 'golfcourseapi', 'opengolfapi', 'scorecard_photo'));
