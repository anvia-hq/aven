-- A project's variables move to the table that holds every scope (decision 0046).
INSERT INTO "environment_variables" ("id", "organization_id", "project_id", "name", "value_encrypted", "value_hint", "secret", "created_at", "updated_at")
SELECT v."id", p."organization_id", v."project_id", v."name", v."value_encrypted", v."value_hint", v."secret", v."created_at", v."updated_at"
FROM "project_variables" v
JOIN "projects" p ON p."id" = v."project_id";
