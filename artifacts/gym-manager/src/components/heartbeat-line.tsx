import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  opacity?: number;
  speed?: number;
  color?: string;
}

export function HeartbeatLine({ className, opacity = 0.7, speed = 3, color = "hsl(var(--primary))" }: Props) {
  const makePeriod = (xOffset: number) =>
    `M ${xOffset},25 L ${xOffset + 24},25 L ${xOffset + 27},20 L ${xOffset + 29},25 ` +
    `L ${xOffset + 47},25 L ${xOffset + 51},4 L ${xOffset + 57},46 L ${xOffset + 61},25 ` +
    `L ${xOffset + 82},25 L ${xOffset + 100},25`;

  const path = [0, 100, 200, 300].map(makePeriod).join(" ");

  return (
    <div className={cn("overflow-hidden pointer-events-none select-none", className)}>
      <svg
        viewBox="0 0 400 50"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: "200%", animation: `ekg-scroll ${speed}s linear infinite` }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="ekg-fade" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor={color} stopOpacity="0" />
            <stop offset="12%"  stopColor={color} stopOpacity={opacity} />
            <stop offset="88%"  stopColor={color} stopOpacity={opacity} />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={path}
          fill="none"
          stroke="url(#ekg-fade)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
