"use client";

import * as React from "react";

/**
 * Barra di progresso. Due modalità:
 *  - value=undefined → indeterminate (animazione shimmer loop)
 *  - value=0..100    → determinate (riempimento progressivo)
 */
export function Progress({
  value,
  label,
  className = "",
}: {
  value?: number;
  label?: string;
  className?: string;
}) {
  const isIndeterminate = value === undefined;
  const pct = isIndeterminate ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div className={`w-full space-y-1.5 ${className}`}>
      {label && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          {!isIndeterminate && <span>{Math.round(pct)}%</span>}
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        {isIndeterminate ? (
          <div
            className="h-full w-1/3 rounded-full bg-primary animate-progress-indeterminate"
            style={{
              animation: "progress-indeterminate 1.5s ease-in-out infinite",
            }}
          />
        ) : (
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <style>{`
        @keyframes progress-indeterminate {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(200%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}
