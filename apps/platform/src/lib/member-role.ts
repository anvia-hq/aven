// Whether a member's role makes them an owner or an admin of the workspace. A role can hold
// several, comma-separated (the control plane reads it the same way).
export function isOwnerOrAdminRole(role: string | undefined) {
  return (role?.split(",").map((part) => part.trim()) ?? []).some(
    (part) => part === "owner" || part === "admin",
  );
}
