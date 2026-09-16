-- Migration number: 0001 	 2026-09-16T18:49:55.658Z

-- Purpose: Record every GitHub account that signs in to gittok.dev.
-- Context: The auth Worker was deliberately stateless, so signups left no trace
-- anywhere. This is the smallest table that answers "who signed up, and when".

-- One row per account, not per sign-in: `first_seen_at` is the signup moment and
-- `last_seen_at` / `sign_in_count` carry the return activity. An events table
-- would answer the same questions at one written row per sign-in forever, which
-- is the dimension the D1 free plan actually caps (100k/day).
CREATE TABLE IF NOT EXISTS users (
  -- GitHub's numeric account id. Stable across username changes, so it is the
  -- identity; `login` is only the current label for it.
  github_id INTEGER PRIMARY KEY,
  login TEXT NOT NULL,
  -- Nullable because it is GitHub's *public profile* email, which most accounts
  -- leave unset. The verified primary address needs the `user:email` scope added
  -- in auth.ts plus a GET /user/emails call; this column fits either source.
  email TEXT,
  -- ISO-8601 UTC, written by the Worker rather than defaulted to
  -- CURRENT_TIMESTAMP so both columns come from one clock reading per sign-in.
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  sign_in_count INTEGER NOT NULL DEFAULT 1
);

-- Supports the only filtered query this table exists for: signups within a
-- window. A bare GROUP BY over every row would scan the table regardless.
CREATE INDEX IF NOT EXISTS idx_users_first_seen_at ON users (first_seen_at);
