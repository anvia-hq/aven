import { useRouter } from "@tanstack/react-router";

import { toast } from "@aven/ui/toast";
import { authClient } from "@/lib/auth-client";

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
