-- ============================================================
-- SEED-SEB Binary Integrity Verification Table
-- Run this in your Supabase SQL Editor:
--   https://supabase.com/dashboard/project/iygqntndsgiysvibqjyw/sql
-- ============================================================

CREATE TABLE IF NOT EXISTS app_build_hashes (
    id          SERIAL PRIMARY KEY,
    version     TEXT NOT NULL,           -- e.g. "1.0.4"
    sha256_hash TEXT NOT NULL,           -- SHA-256 hex of SEED-SEB.exe (lowercase)
    notes       TEXT,                    -- optional build notes
    is_active   BOOLEAN DEFAULT TRUE,    -- set FALSE to revoke a compromised build
    registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by version + hash
CREATE INDEX IF NOT EXISTS idx_app_build_hashes_version_hash
    ON app_build_hashes (version, sha256_hash, is_active);

-- Row Level Security: only service_role key can insert/update/delete
-- The anon key (used by the frontend) cannot modify this table
ALTER TABLE app_build_hashes ENABLE ROW LEVEL SECURITY;

-- Policy: allow SELECT for anyone (the Netlify function uses service_role key anyway,
-- but this allows fallback reads if needed)
CREATE POLICY "Allow read app_build_hashes" ON app_build_hashes
    FOR SELECT USING (TRUE);

-- Policy: only service_role can insert/update/delete (no anon writes)
-- (service_role bypasses RLS automatically in Supabase)

-- ============================================================
-- EXAMPLE: Register your first official build hash
-- (Run the register_build_hash.py script instead of this manually)
-- ============================================================
-- INSERT INTO app_build_hashes (version, sha256_hash, notes)
-- VALUES ('1.0.4', 'paste_your_sha256_hash_here', 'First official release');
