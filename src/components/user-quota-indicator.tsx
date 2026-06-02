import type { UserTokenUsage } from "@/lib/token-usage-store";

type UserQuotaIndicatorProps = {
  usage: UserTokenUsage | null;
};

export function UserQuotaIndicator({ usage }: UserQuotaIndicatorProps) {
  if (!usage) {
    return null;
  }

  const percent = usage.remainingQuotaPercent;
  const isLow = percent <= 15 && !usage.isQuotaExceeded;
  const isExceeded = usage.isQuotaExceeded;

  const trackClass = isExceeded
    ? "bg-red-200 dark:bg-red-900/60"
    : isLow
      ? "bg-amber-200 dark:bg-amber-900/60"
      : "bg-zinc-200 dark:bg-zinc-700";

  const fillClass = isExceeded
    ? "bg-red-600 dark:bg-red-400"
    : isLow
      ? "bg-amber-600 dark:bg-amber-400"
      : "bg-emerald-600 dark:bg-emerald-400";

  const labelClass = isExceeded
    ? "text-red-700 dark:text-red-300"
    : isLow
      ? "text-amber-800 dark:text-amber-200"
      : "text-zinc-700 dark:text-zinc-300";

  return (
    <div
      className="flex min-w-[10rem] flex-col gap-1.5 sm:min-w-[12rem]"
      title={
        isExceeded
          ? "Usage limit reached"
          : `${usage.remainingTotalTokens.toLocaleString()} total tokens, ${usage.remainingOutputTokens.toLocaleString()} output tokens, ~${usage.remainingRequestsEstimate} requests remaining`
      }
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={`font-medium ${labelClass}`}>
          {isExceeded ? "Quota used" : "Quota remaining"}
        </span>
        <span className={`tabular-nums font-semibold ${labelClass}`}>
          {isExceeded ? "0%" : `${percent}%`}
        </span>
      </div>
      <div
        className={`h-1.5 w-full overflow-hidden rounded-full ${trackClass}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={isExceeded ? 0 : percent}
        aria-label={
          isExceeded
            ? "Quota exhausted"
            : `${percent} percent of quota remaining`
        }
      >
        <div
          className={`h-full rounded-full transition-[width] ${fillClass}`}
          style={{ width: isExceeded ? "0%" : `${percent}%` }}
        />
      </div>
    </div>
  );
}
