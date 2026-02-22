import { Rocket } from "lucide-react";

export function EmptyState() {
  return (
    <div className="text-center mt-16 space-y-3">
      <Rocket size={32} className="mx-auto text-text-muted" />
      <p className="text-text-muted">
        &quot;Run&quot; を押して海外プロダクトを取得・評価
      </p>
    </div>
  );
}
