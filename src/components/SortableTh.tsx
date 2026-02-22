"use client";

import { ChevronUp, ChevronDown } from "lucide-react";
import type { SortKey } from "@/lib/constants";

export function SortableTh({
  label,
  sortKey: key,
  current,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onClick: (key: SortKey) => void;
}) {
  const isActive = current === key;
  return (
    <th
      className="py-2 pr-1 text-center cursor-pointer hover:text-text-primary select-none transition-colors duration-150"
      onClick={() => onClick(key)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(key); } }}
      tabIndex={0}
      role="columnheader"
      aria-sort={isActive ? (dir === "desc" ? "descending" : "ascending") : "none"}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {isActive && (dir === "desc" ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}
      </span>
    </th>
  );
}
