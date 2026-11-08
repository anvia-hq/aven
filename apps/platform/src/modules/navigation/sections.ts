/**
 * Threads and projects are one destination for the rail and the tab bar: the Aven mark and, on a
 * phone, the first tab.
 */
export function isThreadsSection(pathname: string) {
  return pathname.startsWith("/threads") || pathname.startsWith("/projects");
}
