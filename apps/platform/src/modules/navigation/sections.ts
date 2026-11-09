export function isThreadsSection(pathname: string) {
  return pathname.startsWith("/threads") || pathname.startsWith("/projects");
}
