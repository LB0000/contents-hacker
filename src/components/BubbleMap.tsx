"use client";

import { useState, useMemo } from "react";
import type { Candidate, MapAxis, MapColorBy } from "@/lib/types";
import { getAxisValue, getAxisRange, getAxisLabel, getGateColor, getCategoryColor, getSourceColor } from "@/lib/map-utils";
import { GATE_BADGE } from "@/lib/constants";
import { CATEGORY_BADGE } from "@/lib/categories";

const W = 600;
const H = 400;
const PAD = { top: 20, right: 20, bottom: 40, left: 50 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;
const MIN_R = 6;
const MAX_R = 22;

interface BubbleData {
  id: string;
  cx: number;
  cy: number;
  r: number;
  fill: string;
  label: string;
  sublabel: string;
  candidate: Candidate;
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function getColor(c: Candidate, colorBy: MapColorBy): string {
  switch (colorBy) {
    case "gate": return getGateColor(c.gate.result);
    case "category": return getCategoryColor(c.marketCategory);
    case "source": return getSourceColor(c.source);
  }
}

export function BubbleMap({
  candidates,
  xAxis,
  yAxis,
  colorBy,
  selectedId,
  onSelect,
}: {
  candidates: Candidate[];
  xAxis: MapAxis;
  yAxis: MapAxis;
  colorBy: MapColorBy;
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const bubbles = useMemo<BubbleData[]>(() => {
    const [xMin, xMax] = getAxisRange(xAxis);
    const [yMin, yMax] = getAxisRange(yAxis);

    // totalScore max from data
    const maxTotal = Math.max(1, ...candidates.map((c) => c.totalScore));

    return candidates.map((c) => {
      const xVal = getAxisValue(c, xAxis);
      const yVal = getAxisValue(c, yAxis);
      const nx = normalize(xVal, xMin, xMax);
      const ny = normalize(yVal, yMin, yMax);

      const sizeRatio = c.totalScore / maxTotal;
      const r = MIN_R + sizeRatio * (MAX_R - MIN_R);

      return {
        id: c.id,
        cx: PAD.left + nx * INNER_W,
        cy: PAD.top + (1 - ny) * INNER_H, // invert Y
        r,
        fill: getColor(c, colorBy),
        label: c.title_ja || c.title_en,
        sublabel: `${getAxisLabel(xAxis)}: ${xVal.toFixed(1)} / ${getAxisLabel(yAxis)}: ${yVal.toFixed(1)}`,
        candidate: c,
      };
    });
  }, [candidates, xAxis, yAxis, colorBy]);

  const [xMin, xMax] = getAxisRange(xAxis);
  const [yMin, yMax] = getAxisRange(yAxis);
  const hoveredBubble = bubbles.find((b) => b.id === hoveredId);

  // Quadrant labels for score axes
  const isScoreAxes = xAxis !== "overseasPopularity" && xAxis !== "totalScore" && yAxis !== "overseasPopularity" && yAxis !== "totalScore";

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full bg-surface-raised rounded-lg border border-border-default"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        <g className="text-border-default" opacity={0.3}>
          {[0.25, 0.5, 0.75].map((p) => (
            <g key={p}>
              <line
                x1={PAD.left + p * INNER_W} y1={PAD.top}
                x2={PAD.left + p * INNER_W} y2={PAD.top + INNER_H}
                stroke="currentColor" strokeDasharray="4 4"
              />
              <line
                x1={PAD.left} y1={PAD.top + p * INNER_H}
                x2={PAD.left + INNER_W} y2={PAD.top + p * INNER_H}
                stroke="currentColor" strokeDasharray="4 4"
              />
            </g>
          ))}
        </g>

        {/* Axes */}
        <line x1={PAD.left} y1={PAD.top + INNER_H} x2={PAD.left + INNER_W} y2={PAD.top + INNER_H} stroke="#374151" />
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + INNER_H} stroke="#374151" />

        {/* Axis labels */}
        <text x={PAD.left + INNER_W / 2} y={H - 5} fill="#9CA3AF" fontSize="11" textAnchor="middle">
          {getAxisLabel(xAxis)} ({xMin}–{xMax})
        </text>
        <text x={12} y={PAD.top + INNER_H / 2} fill="#9CA3AF" fontSize="11" textAnchor="middle" transform={`rotate(-90, 12, ${PAD.top + INNER_H / 2})`}>
          {getAxisLabel(yAxis)} ({yMin}–{yMax})
        </text>

        {/* Quadrant labels */}
        {isScoreAxes && (
          <g fontSize="9" opacity={0.4}>
            <text x={PAD.left + INNER_W * 0.75} y={PAD.top + INNER_H * 0.15} fill="#22C55E" textAnchor="middle">狙い目</text>
            <text x={PAD.left + INNER_W * 0.25} y={PAD.top + INNER_H * 0.85} fill="#EF4444" textAnchor="middle">要検証</text>
          </g>
        )}

        {/* Bubbles */}
        <g>
          {bubbles.map((b) => {
            const isSelected = b.id === selectedId;
            const isHovered = b.id === hoveredId;
            return (
              <circle
                key={b.id}
                cx={b.cx}
                cy={b.cy}
                r={isHovered ? b.r + 2 : b.r}
                fill={b.fill}
                opacity={isSelected ? 1 : 0.7}
                stroke={isSelected ? "#fff" : isHovered ? "#E5E7EB" : "none"}
                strokeWidth={isSelected ? 2 : 1}
                className="cursor-pointer transition-all duration-150"
                style={{ filter: isHovered ? "brightness(1.3)" : undefined }}
                onMouseEnter={() => setHoveredId(b.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={(e) => { e.stopPropagation(); onSelect(b.id); }}
                role="img"
                aria-label={`${b.label}: ${b.sublabel}`}
              />
            );
          })}
        </g>

        {/* Tooltip */}
        {hoveredBubble && (
          <g>
            <rect
              x={Math.min(hoveredBubble.cx + 10, W - 200)}
              y={Math.max(hoveredBubble.cy - 40, 5)}
              width={190}
              height={48}
              rx={4}
              fill="#111827"
              stroke="#374151"
              strokeWidth={1}
            />
            <text
              x={Math.min(hoveredBubble.cx + 16, W - 194)}
              y={Math.max(hoveredBubble.cy - 22, 21)}
              fill="#E5E7EB"
              fontSize="11"
              fontWeight="bold"
            >
              {hoveredBubble.label.slice(0, 25)}{hoveredBubble.label.length > 25 ? "..." : ""}
            </text>
            <text
              x={Math.min(hoveredBubble.cx + 16, W - 194)}
              y={Math.max(hoveredBubble.cy - 6, 37)}
              fill="#9CA3AF"
              fontSize="9"
            >
              {hoveredBubble.sublabel}
            </text>
          </g>
        )}
      </svg>

      {/* Legend */}
      <div className="flex gap-2 mt-2 text-[10px] text-text-muted flex-wrap justify-center">
        {colorBy === "gate" && (["pass", "maybe", "fail"] as const).map((g) => (
          <span key={g} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: getGateColor(g) }} />
            {GATE_BADGE[g].label}
          </span>
        ))}
        {colorBy === "category" && Object.entries(CATEGORY_BADGE).map(([key, badge]) => (
          <span key={key} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: getCategoryColor(key) }} />
            {badge.label}
          </span>
        ))}
        {colorBy === "source" && (["hackernews", "producthunt", "github", "reddit", "indiehackers", "betalist"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: getSourceColor(s) }} />
            {s.slice(0, 2).toUpperCase()}
          </span>
        ))}
        <span className="ml-2">Size = 総合スコア</span>
      </div>
    </div>
  );
}
