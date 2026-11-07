# 0151: Reusable types live in types.ts

Status: accepted.

## Context

Exported types were declared inside implementation files, next to the code that uses them. Finding what a module exposes meant reading its handlers, hooks and components, and importing a type pulled in the file that holds the code. The platform modules already kept shared types in `types.ts`; the control plane, the CLI and the packages did not.

## Decision

- Every exported `type` or `interface` lives in the `types.ts` of its module: `apps/platform/src/modules/<name>/types.ts`, `apps/control-plane/src/modules/<name>/types.ts`, `packages/<name>/src/types.ts`, or the folder's own `types.ts` where a package has sub-folders (`packages/agents/src/tools/types.ts`, `packages/db/src/schema/types.ts`). Files in a module's `hooks/`, `components/` or `testing/` folders use the module's `types.ts`.
- Other files import them with `import type`. A moved type is not re-exported from its old file.
- Component `Props` types and types inferred from a zod schema (`z.infer<typeof schema>`) stay beside the component or the schema. File-private types stay where they are, unless an exported type needs them.
- A type that refers to a value (`typeof table.$inferSelect`, `typeof app`) is in `types.ts` too, with a type-only import of the value; the value is exported when it was not.
- Generated files, `docs/` and `clients/` are left alone.

## Consequences

- A module's vocabulary is one file. Types import from each other without importing implementation at runtime.
- `@aven/protocol/types`, `@aven/agents/types` and the like are new import paths; the old ones no longer carry the types.
- A few values are now exported only for their types: `app` in the control plane's `index.ts`, `MODES`, `SUBJECT_SCOPES`, `THEMES`.
