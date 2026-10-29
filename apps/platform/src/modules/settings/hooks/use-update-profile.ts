import { useRouter } from "@tanstack/react-router";

import { toast } from "@/components/toast";
import { authClient } from "@/lib/auth-client";

// Saves the signed-in user's name. The layout reads the user in its route loader, so invalidating
// the router is what makes the sidebar show the new name.
export function useUpdateProfile() {
  const router = useRouter();

  return async (name: string) => {
    const { error } = await authClient.updateUser({ name });
    if (error) {
      toast.add({
        title: "Could not save profile",
        description: error.message,
        type: "error",
      });
      return;
    }
    await router.invalidate();
    toast.add({ title: "Profile saved", type: "success" });
  };
}
