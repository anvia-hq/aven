/**
 * Which screens the shell frames, as the app bar names them (mobile-app-bar.tsx) and as the rail
 * and the tab bar group them: threads and projects are one destination, the Aven mark.
 */
const SECTIONS = [
  { path: /^\/projects(\/|$)/, title: "Projects" },
  { path: /^\/threads(\/|$)/, title: "Threads" },
  { path: /^\/bot(\/|$)/, title: "Bot" },
  { path: /^\/cockpit(\/|$)/, title: "Cockpit" },
  { path: /^\/center(\/|$)/, title: "Center" },
  { path: /^\/settings(\/|$)/, title: "Settings" },
];

export function sectionTitleOf(pathname: string) {
  return SECTIONS.find((section) => section.path.test(pathname))?.title ?? "Aven";
}

export function isThreadsSection(pathname: string) {
  return pathname.startsWith("/threads") || pathname.startsWith("/projects");
}
