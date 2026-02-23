"use client";

import type { MapAxis, MapColorBy } from "@/lib/types";
import { getAxisLabel } from "@/lib/map-utils";
import { LayoutGrid, LayoutList } from "lucide-react";

const AXES: MapAxis[] = ["jpDemand", "jpGap", "traceSpeed", "riskLow", "overseasPopularity", "totalScore"];
const COLOR_MODES: { value: MapColorBy; label: string }[] = [
  { value: "gate", label: "Gate" },
  { value: "category", label: "カテゴリ" },
  { value: "source", label: "ソース" },
];

export function MapControls({
  viewMode,
  xAxis,
  yAxis,
  colorBy,
  onViewModeChange,
  onXChange,
  onYChange,
  onColorByChange,
}: {
  viewMode: "table" | "map";
  xAxis: MapAxis;
  yAxis: MapAxis;
  colorBy: MapColorBy;
  onViewModeChange: (mode: "table" | "map") => void;
  onXChange: (axis: MapAxis) => void;
  onYChange: (axis: MapAxis) => void;
  onColorByChange: (colorBy: MapColorBy) => void;
}) {
  return (
    <div className="flex items-center gap-3 text-xs flex-wrap">
      {/* View toggle */}
      <div className="flex rounded overflow-hidden border border-border-default">
        <button
          onClick={() => onViewModeChange("table")}
          className={`px-2 py-1 flex items-center gap-1 cursor-pointer transition-colors ${
            viewMode === "table" ? "bg-primary text-white" : "bg-surface-overlay text-text-secondary hover:bg-surface-hover"
          }`}
        >
          <LayoutList size={12} />
          Table
        </button>
        <button
          onClick={() => onViewModeChange("map")}
          className={`px-2 py-1 flex items-center gap-1 cursor-pointer transition-colors ${
            viewMode === "map" ? "bg-primary text-white" : "bg-surface-overlay text-text-secondary hover:bg-surface-hover"
          }`}
        >
          <LayoutGrid size={12} />
          Map
        </button>
      </div>

      {/* Axis selectors (only in map mode) */}
      {viewMode === "map" && (
        <>
          <label className="flex items-center gap-1 text-text-muted">
            X:
            <select
              value={xAxis}
              onChange={(e) => onXChange(e.target.value as MapAxis)}
              className="bg-surface-overlay border border-border-default rounded px-1.5 py-0.5 text-text-secondary cursor-pointer"
            >
              {AXES.filter((a) => a !== yAxis).map((a) => (
                <option key={a} value={a}>{getAxisLabel(a)}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-text-muted">
            Y:
            <select
              value={yAxis}
              onChange={(e) => onYChange(e.target.value as MapAxis)}
              className="bg-surface-overlay border border-border-default rounded px-1.5 py-0.5 text-text-secondary cursor-pointer"
            >
              {AXES.filter((a) => a !== xAxis).map((a) => (
                <option key={a} value={a}>{getAxisLabel(a)}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-text-muted">
            色:
            <select
              value={colorBy}
              onChange={(e) => onColorByChange(e.target.value as MapColorBy)}
              className="bg-surface-overlay border border-border-default rounded px-1.5 py-0.5 text-text-secondary cursor-pointer"
            >
              {COLOR_MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
        </>
      )}
    </div>
  );
}
