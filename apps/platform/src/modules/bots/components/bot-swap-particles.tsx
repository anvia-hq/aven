import type { CSSProperties } from "react";

const COUNT = 8;

const PARTICLES = Array.from({ length: COUNT }, (_, index) => {
  const angle = (index / COUNT) * Math.PI * 2;
  return {
    dx: Math.round(Math.cos(angle) * 19),
    dy: Math.round(Math.sin(angle) * 19),
    delay: `${index * 15}ms`,
  };
});

export function BotSwapParticles() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {PARTICLES.map((particle, index) => (
        <span
          key={index}
          className="bot-particle absolute top-1/2 left-1/2 size-[3px] rounded-full bg-primary"
          style={
            {
              "--dx": `${particle.dx}px`,
              "--dy": `${particle.dy}px`,
              animationDelay: particle.delay,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
