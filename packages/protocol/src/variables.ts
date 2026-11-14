export const NAME_PATTERN = "[A-Za-z_][A-Za-z0-9_]*";

export const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const MAX_NAME_LENGTH = 128;

export const MAX_VALUE_LENGTH = 8192;

export const MAX_VARIABLES = 100;

export const MIN_REDACTED_LENGTH = 8;

const RESERVED = /^(PATH|HOME|USER|SHELL|PWD|LD_.*|AVEN_.*|GH_.*|GITHUB_.*|GIT_.*)$/i;

export const isReservedName = (name: string) => RESERVED.test(name);
