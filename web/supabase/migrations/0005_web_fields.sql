-- ============================================================================
-- Fields the web app records that the Android app does not (yet). Optional, so Android rows
-- stay valid; partial upserts from Android never blank them.
--   sessions: the device time zone and local calendar day at start (so "today" and streaks
--             are counted in the student's own day), the expected difficulty chosen before
--             starting, the syllabus topic studied, and the score of a timed mock.
--   mock_tests: scoring mode. CA papers and GATE are entered as marks obtained out of the
--             paper maximum (MARKS_ENTRY), not per question.
-- ============================================================================
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS tz TEXT CHECK (tz IS NULL OR char_length(tz) BETWEEN 1 AND 64),
  ADD COLUMN IF NOT EXISTS local_date TEXT CHECK (local_date IS NULL OR local_date ~ '^\d{4}-\d{2}-\d{2}$'),
  ADD COLUMN IF NOT EXISTS expected_difficulty SMALLINT CHECK (expected_difficulty IS NULL OR expected_difficulty BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS topic_id UUID,
  ADD COLUMN IF NOT EXISTS mock_score NUMERIC CHECK (mock_score IS NULL OR mock_score BETWEEN -100000 AND 100000),
  ADD COLUMN IF NOT EXISTS mock_max_score NUMERIC CHECK (mock_max_score IS NULL OR mock_max_score > 0);

ALTER TABLE public.mock_tests
  ADD COLUMN IF NOT EXISTS scoring_mode TEXT NOT NULL DEFAULT 'PER_QUESTION' CHECK (scoring_mode IN ('PER_QUESTION', 'MARKS_ENTRY'));
