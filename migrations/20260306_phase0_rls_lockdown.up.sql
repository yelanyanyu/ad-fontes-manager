BEGIN;

-- Remove unsafe PUBLIC write policies.
DROP POLICY IF EXISTS "Allow public write access" ON words;
DROP POLICY IF EXISTS "Allow public write access" ON etymologies;
DROP POLICY IF EXISTS "Allow public write access" ON cognates;
DROP POLICY IF EXISTS "Allow public write access" ON examples;
DROP POLICY IF EXISTS "Allow public write access" ON synonyms;
DROP POLICY IF EXISTS "Allow public write access" ON user_requests;

-- Ensure idempotent reruns.
DROP POLICY IF EXISTS "Allow service write access" ON words;
DROP POLICY IF EXISTS "Allow service write access" ON etymologies;
DROP POLICY IF EXISTS "Allow service write access" ON cognates;
DROP POLICY IF EXISTS "Allow service write access" ON examples;
DROP POLICY IF EXISTS "Allow service write access" ON synonyms;
DROP POLICY IF EXISTS "Allow service write access" ON user_requests;

-- Restrict write policy to trusted DB role.
CREATE POLICY "Allow service write access" ON words
    AS PERMISSIVE
    FOR ALL
    TO postgres
    USING true
    WITH CHECK true;

CREATE POLICY "Allow service write access" ON etymologies
    AS PERMISSIVE
    FOR ALL
    TO postgres
    USING true
    WITH CHECK true;

CREATE POLICY "Allow service write access" ON cognates
    AS PERMISSIVE
    FOR ALL
    TO postgres
    USING true
    WITH CHECK true;

CREATE POLICY "Allow service write access" ON examples
    AS PERMISSIVE
    FOR ALL
    TO postgres
    USING true
    WITH CHECK true;

CREATE POLICY "Allow service write access" ON synonyms
    AS PERMISSIVE
    FOR ALL
    TO postgres
    USING true
    WITH CHECK true;

CREATE POLICY "Allow service write access" ON user_requests
    AS PERMISSIVE
    FOR ALL
    TO postgres
    USING true
    WITH CHECK true;

COMMIT;

