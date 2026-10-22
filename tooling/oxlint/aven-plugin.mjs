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

export default {
  meta: { name: "aven" },
  rules: { "no-conditional-spread": rule },
};
