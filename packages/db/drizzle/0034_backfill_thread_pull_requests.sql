-- A thread's one pull request moves to its own table (decision 0069). Its title and state are not
-- known here; the next sync after a run replaces them.
INSERT INTO "thread_pull_requests" ("thread_id", "number", "url", "branch", "title", "state")
SELECT "id", "pull_request_number", "pull_request_url", 'aven/' || left("id"::text, 8),
       'Pull request #' || "pull_request_number", 'open'
FROM "threads"
WHERE "pull_request_number" IS NOT NULL AND "pull_request_url" IS NOT NULL;
