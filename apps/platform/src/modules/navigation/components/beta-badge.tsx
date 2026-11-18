export function BetaBadge() {
  return (
    <div
      role="note"
      className="pointer-events-none fixed right-3 bottom-3 z-40 hidden items-center gap-1.5 rounded-full border border-meter/30 bg-meter/12 px-2.5 py-1 text-[0.7rem] leading-none font-medium text-meter backdrop-blur-sm md:flex"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-meter" />
      Beta · expect rough edges
    </div>
  );
}
