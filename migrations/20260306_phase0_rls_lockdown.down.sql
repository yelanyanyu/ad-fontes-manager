BEGIN;

-- Remove restricted service write policy.
DROP POLICY IF EXISTS "Allow service write access" ON words;
DROP POLICY IF EXISTS "Allow service write access" ON etymologies;
DROP POLICY IF EXISTS "Allow service write access" ON cognates;
DROP POLICY IF EXISTS "Allow service write access" ON examples;
DROP POLICY IF EXISTS "Allow service write access" ON synonyms;
DROP POLICY IF EXISTS "Allow service write access" ON user_requests;

-- Restore legacy public write policy (rollback only).
CREATE POLICY "Allow public write access" ON words
    AS PERMISSIVE
    FOR ALL
    USING true
    WITH CHECK true;

CREATE POLICY "Allow public write access" ON etymologies
    AS PERMISSIVE
    FOR ALL
    USING true
    WITH CHECK true;

CREATE POLICY "Allow public write access" ON cognates
    AS PERMISSIVE
    FOR ALL
    USING true
    WITH CHECK true;

CREATE POLICY "Allow public write access" ON examples
    AS PERMISSIVE
    FOR ALL
    USING true
    WITH CHECK true;

CREATE POLICY "Allow public write access" ON synonyms
    AS PERMISSIVE
    FOR ALL
    USING true
    WITH CHECK true;

CREATE POLICY "Allow public write access" ON user_requests
    AS PERMISSIVE
    FOR ALL
    USING true
    WITH CHECK true;

COMMIT;

