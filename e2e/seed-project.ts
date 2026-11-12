import { SQL } from "bun";

const [installationId, runtimeId, name] = process.argv.slice(2);
const url = process.env.DATABASE_URL;

if (!url || !installationId || !runtimeId || !name) {
  throw new Error(
    "usage: DATABASE_URL=... bun e2e/seed-project.ts <installation> <runtime> <name>",
  );
}

if (!new URL(url).pathname.slice(1).endsWith("_e2e")) {
  throw new Error("Refusing to seed a database whose name does not end in _e2e");
}

const sql = new SQL(url);
const [project] = await sql`
  insert into projects (organization_id, created_by, runtime_id, github_installation_id, repo_full_name, clone_url, default_branch, name)
  select organization_id, connected_by, ${runtimeId}::uuid, id, ${`acme/${name}`}, ${`https://github.com/acme/${name}.git`}, 'main', ${name}
  from github_installations where id = ${installationId}::uuid
  returning id
`;
await sql.close();
console.log(project.id);
