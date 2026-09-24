export type NavigationIconName = "trips" | "maps" | "saved" | "journal" | "you";

interface NavigationIconProps {
  active: boolean;
  name: NavigationIconName;
}

// Adapted from Lucide; see /licenses/lucide.txt.
export function NavigationIcon({ active, name }: NavigationIconProps): React.JSX.Element {
  const fill = active ? "currentColor" : "none";

  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      height={24}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={24}
      xmlns="http://www.w3.org/2000/svg"
    >
      {name === "trips" ? (
        <>
          <path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          <rect fill={fill} height={14} rx={2} width={20} x={2} y={6} />
        </>
      ) : null}

      {name === "saved" ? (
        <path
          d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"
          fill={fill}
        />
      ) : null}

      {name === "maps" ? (
        <>
          <path
            d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"
            fill={fill}
          />
          <path
            d={active ? "M15 6.7v12.4M9 4.5v12.8" : "M15 5.764v15M9 3.236v15"}
            stroke={active ? "var(--color-on-accent)" : "currentColor"}
            strokeWidth={active ? 1.5 : 2}
          />
        </>
      ) : null}

      {name === "journal" ? (
        <>
          <path
            d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 1 4 17.5 2.5 2.5 0 0 1 6.5 15H20"
            fill={fill}
          />
          <path
            d="M8 7h8M8 11h6"
            stroke={active ? "var(--color-on-accent)" : "currentColor"}
            strokeWidth={active ? 1.5 : 2}
          />
        </>
      ) : null}

      {name === "you" ? (
        <>
          <circle cx={12} cy={8} fill={fill} r={5} />
          <path d={`M20 21a8 8 0 0 0-16 0${active ? "Z" : ""}`} fill={fill} />
        </>
      ) : null}
    </svg>
  );
}
