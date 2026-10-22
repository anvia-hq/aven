// Custom oxlint rules for this repo. Loaded through `jsPlugins` in .oxlintrc.json.
const isConditional = (node) =>
  node.type === "ConditionalExpression" ||
  (node.type === "LogicalExpression" && ["&&", "||", "??"].includes(node.operator));

const unwrap = (node) => (node.type === "ParenthesizedExpression" ? unwrap(node.expression) : node);

const rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Disallow conditional spreads like `...(cond && { a })`." },
    messages: {
      noConditionalSpread:
        "Avoid conditional spread. Build the object explicitly or assign the property in an `if`.",
    },
    schema: [],
  },
  create(context) {
    const check = (node) => {
      if (isConditional(unwrap(node.argument))) {
        context.report({ node, messageId: "noConditionalSpread" });
      }
    };
    return { SpreadElement: check };
  },
};

const isReExport = (node) =>
  (node.type === "ExportAllDeclaration" || node.type === "ExportNamedDeclaration") &&
  node.source != null;

const noBarrelFile = {
  meta: {
    type: "suggestion",
    docs: { description: "Disallow barrel files that only re-export from other modules." },
    messages: { noBarrelFile: "Barrel files are not allowed. Import from the exact file." },
    schema: [],
  },
  create(context) {
    return {
      Program(node) {
        if (node.body.length > 0 && node.body.every(isReExport)) {
          context.report({ node, messageId: "noBarrelFile" });
        }
      },
    };
  },
};

export default {
  meta: { name: "aven" },
  rules: { "no-conditional-spread": rule, "no-barrel-file": noBarrelFile },
};
