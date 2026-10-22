import type { UserRow } from "../types";

export function UsersTable({ users }: { users: UserRow[] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-border text-muted-foreground">
        <tr>
          <th className="py-2 font-medium">Name</th>
          <th className="py-2 font-medium">Email</th>
          <th className="py-2 font-medium">Joined</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id} className="border-b border-border/50">
            <td className="py-2">{user.name}</td>
            <td className="py-2">{user.email}</td>
            <td className="py-2">{new Date(user.createdAt).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
