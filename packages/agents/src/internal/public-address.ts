import { isIP } from "node:net";

function privateV4(address: string) {
  const [a = 0, b = 0, c = 0] = address.split(".").map(Number);

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function wordsOf(part: string) {
  if (!part.includes(".")) return [Number.parseInt(part, 16)];

  const [a = 0, b = 0, c = 0, d = 0] = part.split(".").map(Number);
  return [a * 256 + b, c * 256 + d];
}

function groupsOf(address: string) {
  const [head = "", tail] = address.split("::");
  const parse = (text: string) => (text === "" ? [] : text.split(":").flatMap(wordsOf));
  const left = parse(head);

  if (tail === undefined) return left;

  const right = parse(tail);

  return [...left, ...Array.from({ length: 8 - left.length - right.length }, () => 0), ...right];
}

const fromWords = (high: number, low: number) =>
  `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;

export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return privateV4(address);

  const groups = groupsOf(address.toLowerCase());
  const [first = 0, second = 0] = groups;
  const embedded = groups.slice(0, 5).every((word) => word === 0) && groups[5] === 0xffff;

  if (embedded) return privateV4(fromWords(groups[6] ?? 0, groups[7] ?? 0));

  if (first === 0x64 && second === 0xff9b) {
    return privateV4(fromWords(groups[6] ?? 0, groups[7] ?? 0));
  }

  if (first === 0x2002) return privateV4(fromWords(second, groups[2] ?? 0));

  const unspecifiedOrLoopback =
    groups.slice(0, 7).every((word) => word === 0) && (groups[7] ?? 0) <= 1;

  return (
    unspecifiedOrLoopback ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00
  );
}
