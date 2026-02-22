import { AlertTriangle } from "lucide-react";

export function ErrorPanel({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="mb-6 p-4 bg-red-900/30 border border-red-800 rounded-lg">
      <h2 className="font-semibold text-red-400 mb-2 flex items-center gap-2">
        <AlertTriangle size={16} />
        Errors
      </h2>
      <ul className="text-sm text-red-300 space-y-1">
        {errors.map((err, i) => (
          <li key={i}>{err}</li>
        ))}
      </ul>
    </div>
  );
}
