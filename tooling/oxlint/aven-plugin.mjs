import noBarrelFile from "./rules/no-barrel-file.mjs";
import noComments from "./rules/no-comments.mjs";
import noConditionalSpread from "./rules/no-conditional-spread.mjs";
import noNativePrimitives from "./rules/no-native-primitives.mjs";
import paddedIf from "./rules/padded-if.mjs";

export default {
  meta: { name: "aven" },
  rules: {
    "no-comments": noComments,
    "no-conditional-spread": noConditionalSpread,
    "no-barrel-file": noBarrelFile,
    "no-native-primitives": noNativePrimitives,
    "padded-if": paddedIf,
  },
};
