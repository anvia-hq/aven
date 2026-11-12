type Props = {
  additions: number;
  deletions: number;
  hideZeros?: boolean;
};

export function DiffStat({ additions, deletions, hideZeros = false }: Props) {
  if (hideZeros) {
    return (
      <>
        {additions > 0 && <span className="text-success">+{additions}</span>}
        {deletions > 0 && <span className="text-destructive">-{deletions}</span>}
      </>
    );
  }

  return (
    <>
      <span className="text-success">+{additions}</span>{" "}
      <span className="text-destructive">-{deletions}</span>
    </>
  );
}
