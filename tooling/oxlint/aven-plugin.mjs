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
    return { SpreadElement: check, JSXSpreadAttribute: check };
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

const PADDED_IF_PARENTS = new Set([
  "Program",
  "BlockStatement",
  "StaticBlock",
  "SwitchCase",
  "TSModuleBlock",
]);

const isBlank = (line) => line === undefined || line.trim() === "";
const opensBlock = (line) => line.trimEnd().endsWith("{");
const closesBlock = (line) => line.trimStart().startsWith("}");
const isCaseLabel = (line) => /^(case\b.*|default)\s*:$/.test(line.trim());

const paddedIf = {
  meta: {
    type: "layout",
    docs: { description: "Require a blank line above and below each `if` statement." },
    fixable: "whitespace",
    messages: {
      padBefore: "Put a blank line before this `if`.",
      padAfter: "Put a blank line after this `if`.",
    },
    schema: [],
  },
  create(context) {
    const pad = (node, messageId, index) =>
      context.report({
        node,
        messageId,
        fix: (fixer) => fixer.insertTextBeforeRange([index, index], "\n"),
      });
    return {
      IfStatement(node) {
        if (!PADDED_IF_PARENTS.has(node.parent.type)) return;

        const { lines } = context.sourceCode;
        const startLine = node.loc.start.line;
        const endLine = node.loc.end.line;

        if (startLine > 1) {
          const previous = lines[startLine - 2];

          if (!isBlank(previous) && !opensBlock(previous) && !isCaseLabel(previous)) {
            pad(
              node,
              "padBefore",
              context.sourceCode.getIndexFromLoc({ line: startLine, column: 0 }),
            );
          }
        }

        if (endLine < lines.length) {
          const next = lines[endLine];

          if (!isBlank(next) && !closesBlock(next) && !isCaseLabel(next)) {
            pad(
              node,
              "padAfter",
              context.sourceCode.getIndexFromLoc({ line: endLine + 1, column: 0 }),
            );
          }
        }
      },
    };
  },
};

// Native elements that Base UI covers. Use the wrappers in `src/components` instead.
const NATIVE_PRIMITIVES = new Set([
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "form",
  "fieldset",
  "dialog",
  "progress",
  "meter",
]);

const noNativePrimitives = {
  meta: {
    type: "suggestion",
    docs: { description: "Disallow native form/interactive elements; use Base UI primitives." },
    messages: {
      noNativePrimitive:
        "Do not use native <{{name}}>. Use the Base UI based component from src/components.",
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const name = node.name.type === "JSXIdentifier" ? node.name.name : null;

        if (name && NATIVE_PRIMITIVES.has(name)) {
          context.report({ node, messageId: "noNativePrimitive", data: { name } });
        }
      },
    };
  },
};

export default {
  meta: { name: "aven" },
  rules: {
    "no-conditional-spread": rule,
    "no-barrel-file": noBarrelFile,
    "no-native-primitives": noNativePrimitives,
    "padded-if": paddedIf,
  },
};
