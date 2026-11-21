export const isAbsoluteUrl = (href: string) => /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href);
