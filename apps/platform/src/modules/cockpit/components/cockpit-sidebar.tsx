import { Clipboard, FileText, Inbox, Kanban, Tag } from "@mynaui/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/sidebar";

import { useCockpitTags } from "../hooks/use-collection";
import { useInbox } from "../hooks/use-inbox";
import { useNotes } from "../hooks/use-notes";
import { useTasks } from "../hooks/use-tasks";
import type { CockpitTag } from "../types";

type Page = "/cockpit/inbox" | "/cockpit/tasks" | "/cockpit/notes";

// How many of the page's records carry a tag.
function countOn(page: Page, tag: CockpitTag) {
  if (page === "/cockpit/tasks") return tag.tasks;
  if (page === "/cockpit/notes") return tag.notes;
  return tag.inbox;
}

// What the sidebar lists in the cockpit (decision 0104): its three pages, with what is open in the
// inbox and the tasks not finished, the notes pinned, as Notion's favourites, and the person's tags, which filter the page on screen.
export function CockpitSidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activeTag = useRouterState({
    select: (state) => (state.location.search as { tag?: string }).tag,
  });
  const { items } = useInbox();
  const { tasks } = useTasks();
  const tags = useCockpitTags();
  const { notes } = useNotes();
  const pinned = notes.filter((note) => note.pinned);
  const openNote = useRouterState({
    select: (state) => (state.location.search as { note?: string }).note,
  });
  const page: Page =
    (["/cockpit/tasks", "/cockpit/notes"] as const).find((to) => pathname.startsWith(to)) ??
    "/cockpit/inbox";
  const open = items.filter((item) => !item.done).length;
  const active = tasks.filter(
    (task) => task.status !== "done" && task.status !== "cancelled",
  ).length;

  const pages = [
    { to: "/cockpit/inbox", label: "Inbox", icon: Inbox, count: open },
    { to: "/cockpit/tasks", label: "Tasks", icon: Kanban, count: active },
    { to: "/cockpit/notes", label: "Notes", icon: Clipboard, count: 0 },
  ] as const;

  return (
    <nav aria-label="Cockpit">
      <SidebarGroup className="py-1">
        <SidebarGroupLabel>Cockpit</SidebarGroupLabel>
        <SidebarMenu>
          {pages.map((item) => (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton
                render={<Link to={item.to} aria-current={page === item.to ? "page" : undefined} />}
                isActive={page === item.to}
                tooltip={item.label}
              >
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
              {item.count > 0 && <SidebarMenuBadge>{item.count}</SidebarMenuBadge>}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
      {pinned.length > 0 && (
        <SidebarGroup className="py-1">
          <SidebarGroupLabel>Pinned</SidebarGroupLabel>
          <SidebarMenu aria-label="Pinned notes">
            {pinned.map((note) => (
              <SidebarMenuItem key={note.id}>
                <SidebarMenuButton
                  size="sm"
                  isActive={openNote === note.id}
                  tooltip={note.title}
                  render={<Link to="/cockpit/notes" search={{ note: note.id }} />}
                >
                  <FileText />
                  <span>{note.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      )}
      {tags.length > 0 && (
        <SidebarGroup className="py-1">
          <SidebarGroupLabel>Tags</SidebarGroupLabel>
          <SidebarMenu aria-label="Tags">
            {tags.map((tag) => {
              const here = countOn(page, tag);
              const selected = activeTag === tag.name;
              return (
                <SidebarMenuItem key={tag.name}>
                  <SidebarMenuButton
                    size="sm"
                    isActive={selected}
                    tooltip={`#${tag.name}`}
                    render={
                      <Link
                        to={page}
                        search={(prev: Record<string, unknown>) => ({
                          ...prev,
                          tag: selected ? undefined : tag.name,
                        })}
                      />
                    }
                  >
                    <Tag />
                    <span>{tag.name}</span>
                  </SidebarMenuButton>
                  {here > 0 && <SidebarMenuBadge>{here}</SidebarMenuBadge>}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      )}
    </nav>
  );
}
