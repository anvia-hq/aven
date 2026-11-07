import { useState } from "react";

import { api, attempt } from "@/lib/api";

type AppManifest = { postUrl: string; manifest: unknown };

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

export function useCreateGithubApp() {
  const [working, setWorking] = useState(false);

  async function create(
    options: { organization?: string; public?: boolean; workspace?: boolean } = {},
  ) {
    setWorking(true);
    const params = new URLSearchParams();
    if (options.organization) params.set("organization", options.organization);
    if (options.public) params.set("public", "true");
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
