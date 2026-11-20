export function required<T extends { command: string }, K extends keyof T & string>(
  input: T,
  key: K,
): NonNullable<T[K]> {
  const value = input[key];

  if (value === undefined) throw new Error(`${input.command} needs ${key}`);

  return value as NonNullable<T[K]>;
}
