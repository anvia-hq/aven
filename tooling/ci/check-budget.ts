const args = process.argv.slice(2);
const label = args[0];
const startSec = Number(args[1]);
const budgetSec = Number(args[2]);

if (!label || !Number.isFinite(startSec) || !Number.isFinite(budgetSec)) {
  console.error("Usage: bun tooling/ci/check-budget.ts <label> <start-epoch-sec> <budget-sec>");
  process.exit(1);
}

const elapsed = Math.floor(Date.now() / 1000) - startSec;
console.log(`Budget [${label}]: ${elapsed}s / ${budgetSec}s`);

if (elapsed > budgetSec) {
  console.error(`::error::Budget exceeded for ${label}: ${elapsed}s > ${budgetSec}s`);
  process.exit(1);
}
