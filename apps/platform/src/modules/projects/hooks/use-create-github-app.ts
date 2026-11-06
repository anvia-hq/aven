import { useState } from "react";

import { api, attempt } from "@/lib/api";

type AppManifest = { postUrl: string; manifest: unknown };

// GitHub creates an app from a manifest posted as a form, and answers by sending the browser back
// to the control plane (decision 0074). A form post is the only way to hand it over.
function postManifest({ postUrl, manifest }: AppManifest) {
  const form = document.createElement("form");
  form.method = "post";
  form.action = postUrl;
  const field = document.createElement("input");
  field.type = "hidden";
  field.name = "manifest";
  field.value = JSON.stringify(manifest);
  form.append(field);
  document.body.append(form);
  form.submit();
}

// Starts creating the GitHub App: asks the control plane for the manifest and sends the browser to
// GitHub with it. The page is left on success, so `working` stays on.
export function useCreateGithubApp() {
  const [working, setWorking] = useState(false);

  async function create(
    options: { organization?: string; public?: boolean; workspace?: boolean } = {},
  ) {
    setWorking(true);
    const params = new URLSearchParams();
    if (options.organization) params.set("organization", options.organization);
    if (options.public) params.set("public", "true");
    // The workspace's own app, not the platform's (decision 0123).
    if (options.workspace) params.set("scope", "workspace");
    const query = params.size > 0 ? `?${params}` : "";
    const manifest = await attempt("Could not start the GitHub App setup", () =>
      api<AppManifest>(`/github/app/manifest${query}`),
    );
    if (manifest) postManifest(manifest);
    else setWorking(false);
  }

  return { create, working };
}
