export function isOwnerOrAdminRole(role: string | undefined) {
  return (role?.split(",").map((part) => part.trim()) ?? []).some(
    (part) => part === "owner" || part === "admin",
  );
}
