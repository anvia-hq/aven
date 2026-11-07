import { LabeledSelect } from "@/components/labeled-select";
import type { ImportRepositoryState } from "../types";

type Props = {
  state: ImportRepositoryState;
};

export function ImportRepositoryFields({ state }: Props) {
  const { installations, installationId, repos, installUrl } = state;
  return (
    <>
      <LabeledSelect
        label="GitHub account"
        options={installations.map((entry) => ({
          value: entry.id,
          label: entry.accountLogin,
        }))}
        value={installationId}
        onChange={state.chooseInstallation}
        placeholder="Choose an account"
      />
      {repos?.error ? (
        <p className="text-sm text-destructive">{repos.error}</p>
      ) : (
        <LabeledSelect
          label="Repository"
          options={state.repoOptions}
          value={state.repository}
          onChange={state.setRepository}
          placeholder={repos ? "Choose a repository" : "Loading repositories…"}
        />
      )}
      <LabeledSelect
        label="Runner"
        options={state.runners}
        value={state.chosenRunner}
        onChange={state.setRuntimeId}
        placeholder="Choose a runner"
      />
      {installUrl && (
        <a href={installUrl} className="text-sm text-muted-foreground underline">
          Repository not listed? Add it to the GitHub app
        </a>
      )}
    </>
  );
}
