import type { Category } from "../lib/api";

const paths = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  goals: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  activity: "M4 20V10M9 20V4M14 20v-8M19 20V7",
  shield: "M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z M8.5 12l2.5 2.5 4.5-5",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  plus: "M12 5v14M5 12h14",
  back: "M15 18l-6-6 6-6",
  chevron: "M9 6l6 6-6 6",
  pause: "M9 5v14M15 5v14",
  play: "M7 4.5v15l12-7.5z",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  withdraw: "M12 4v12M7 11l5 5 5-5M5 20h14",
  topup: "M12 20V8M7 13l5-5 5 5M5 4h14",
  check: "M5 12.5l4.5 4.5L19 7",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01",
  bank: "M3 9l9-5 9 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 20h18",
  upi: "M7 4l-3 16M13 4l-3 16M17 7l3 5-3 5",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4",
  flame: "M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.6 1 2.5 2 2.5-1-3 0-6 1-8z",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  menu: "M4 7h16M8 12h12M12 17h8",
  close: "M6 6l12 12M18 6 6 18",
  laptop: "M5 6h14v9H5zM3 18h18",
  phone: "M8 3h8v18H8zM11 18h2",
  plane: "M10.5 4.5 13 3l1 7 6 3v2l-6-1-.5 4 2 1.5V21l-3.5-1-3.5 1v-1.5l2-1.5-.5-4-6 1v-2l6-3z",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7",
  headphones: "M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H4zM17 15h3v5h-3z",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 22, stroke = 1.8 }: { name: IconName; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

const CAT_ICON: Record<Category, IconName> = {
  laptop: "laptop",
  smartphone: "phone",
  travel: "plane",
  education: "book",
  gadget: "headphones",
  other: "sparkle",
};

export function GoalIcon({ category, size = "md", brand }: { category: Category; size?: "md" | "sm"; brand?: boolean }) {
  return (
    <span className={`goal-icon ${size === "sm" ? "sm" : ""} ${brand ? "brand" : ""}`}>
      <Icon name={CAT_ICON[category]} size={size === "sm" ? 20 : 24} stroke={1.6} />
    </span>
  );
}
