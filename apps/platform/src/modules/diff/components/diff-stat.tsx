type Props = {
  additions: number;
  deletions: number;
  /** Leave out a count that is zero. */
  hideZeros?: boolean;
};

// Lines added and removed, as "+3 -1".
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
