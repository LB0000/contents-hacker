"use client";

import type { FeedbackStatus } from "@/lib/types";
import { Eye, Rocket, SkipForward, CheckCircle, XCircle } from "lucide-react";

const BUTTONS: { status: FeedbackStatus; icon: typeof Eye; label: string; activeColor: string }[] = [
  { status: "considering", icon: Eye, label: "検討中", activeColor: "bg-blue-900 text-blue-300" },
  { status: "started", icon: Rocket, label: "着手", activeColor: "bg-purple-900 text-purple-300" },
  { status: "skipped", icon: SkipForward, label: "見送り", activeColor: "bg-surface-overlay text-text-secondary" },
  { status: "succeeded", icon: CheckCircle, label: "成功", activeColor: "bg-green-900 text-green-300" },
  { status: "failed", icon: XCircle, label: "失敗", activeColor: "bg-red-900 text-red-300" },
];

export function FeedbackButtons({
  currentStatus,
  onFeedback,
}: {
  currentStatus?: FeedbackStatus;
  onFeedback: (status: FeedbackStatus) => void;
}) {
  return (
    <span className="inline-flex gap-0.5">
      {BUTTONS.map(({ status, icon: Icon, label, activeColor }) => {
        const isActive = currentStatus === status;
        return (
          <button
            key={status}
            onClick={(e) => { e.stopPropagation(); onFeedback(status); }}
            title={label}
            aria-label={label}
            aria-pressed={isActive}
            className={`p-0.5 rounded transition-colors duration-150 cursor-pointer ${
              isActive ? activeColor : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <Icon size={11} />
          </button>
        );
      })}
    </span>
  );
}
