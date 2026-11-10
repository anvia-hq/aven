const NAMED: Record<string, number> = {
  return: 0xff0d,
  enter: 0xff0d,
  tab: 0xff09,
  escape: 0xff1b,
  esc: 0xff1b,
  backspace: 0xff08,
  delete: 0xffff,
  space: 0x20,
  up: 0xff52,
  down: 0xff54,
  left: 0xff51,
  right: 0xff53,
  home: 0xff50,
  end: 0xff57,
  pageup: 0xff55,
  page_up: 0xff55,
  pagedown: 0xff56,
  page_down: 0xff56,
  shift: 0xffe1,
  ctrl: 0xffe3,
  control: 0xffe3,
  alt: 0xffe9,
  option: 0xffe9,
  opt: 0xffe9,
  super: 0xffea,
  cmd: 0xffea,
  command: 0xffea,
  meta: 0xffea,
};

const MODIFIERS = new Set([0xffe1, 0xffe3, 0xffe9, 0xffea]);

const SHIFTED = new Set('~!@#$%^&*()_+{}|:"<>?');

export const needsShift = (char: string) => SHIFTED.has(char) || (char >= "A" && char <= "Z");

export function charKeysym(char: string) {
  if (char === "\n" || char === "\r") return NAMED.return!;
  if (char === "\t") return NAMED.tab!;
  const code = char.codePointAt(0)!;
  return code < 0x100 ? code : 0x01000000 + code;
}

function keysymOf(name: string) {
  const key = name.toLowerCase();
  const named = NAMED[key];
  if (named !== undefined) return named;
  const function_ = /^f([1-9]|1[0-2])$/.exec(key);
  if (function_) return 0xffbd + Number(function_[1]);
  if ([...name].length === 1) return charKeysym(name);
  throw new Error(`Unknown key "${name}"`);
}

export function keyChord(keys: string) {
  const parts = keys.split("+").filter((part) => part.length > 0);
  if (parts.length === 0) throw new Error("No key to press");
  const symbols = parts.map(keysymOf);
  const modifiers = symbols.slice(0, -1);
  if (!modifiers.every((symbol) => MODIFIERS.has(symbol))) {
    throw new Error(`"${keys}" has a key that is not a modifier before the last one`);
  }
  return { modifiers, key: symbols.at(-1)! };
}
