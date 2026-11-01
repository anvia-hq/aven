-- A handle for every bot made before handles: the main bot is `main`; any other is a slug of its
-- name, with a number after it when a person has another with the same slug (decision 0065).
WITH slugs AS (
  SELECT
    id,
    user_id,
    created_at,
    CASE
      WHEN is_main THEN 'main'
      ELSE coalesce(
        nullif(
          trim(both '-' from left(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), 30)),
          ''
        ),
        'bot'
      )
    END AS slug,
    is_main
  FROM bots
  WHERE handle = ''
), named AS (
  SELECT
    id,
    user_id,
    created_at,
    CASE WHEN NOT is_main AND slug IN ('main', 'user', 'system') THEN slug || '-bot' ELSE slug END AS slug
  FROM slugs
), ranked AS (
  SELECT id, slug, row_number() OVER (PARTITION BY user_id, slug ORDER BY created_at, id) AS n
  FROM named
)
UPDATE bots
SET handle = ranked.slug || CASE WHEN ranked.n > 1 THEN '-' || ranked.n ELSE '' END
FROM ranked
WHERE bots.id = ranked.id;
