import { Switch } from "@/components/switch";

import { usePlatformConfig } from "../hooks/use-platform-config";

export function RegistrationSection() {
  const { config, setRegistrationEnabled } = usePlatformConfig();

  return (
    <section aria-label="Registration" className="flex max-w-md flex-col gap-4">
      <h2 className="text-lg font-semibold">Registration</h2>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-sm font-medium">Allow new sign-ups</span>
          <span className="text-xs text-muted-foreground">
            When off, only people with an invite link can create an account.
          </span>
        </div>
        <Switch
          aria-label="Allow new sign-ups"
          disabled={!config}
          checked={config?.registrationEnabled ?? true}
          onCheckedChange={setRegistrationEnabled}
        />
      </div>
    </section>
  );
}
