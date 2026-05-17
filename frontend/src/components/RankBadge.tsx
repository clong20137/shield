import { ShieldCheck } from 'lucide-react';
import { leadershipRanks } from '../constants/ranks';

const importantRanks = new Map(leadershipRanks.map((rank) => [rank.toLowerCase(), rank]));

function normalizeRank(rank?: string | null): string {
  return (rank || '').trim().replace(/\s+/gu, ' ').toLowerCase();
}

export function isImportantRank(rank?: string | null): boolean {
  return importantRanks.has(normalizeRank(rank));
}

export function getDisplayRank(rank?: string | null): string {
  const cleanRank = (rank || '').trim().replace(/\s+/gu, ' ');
  return importantRanks.get(normalizeRank(cleanRank)) || cleanRank || 'No rank listed';
}

export function RankBadge({
  rank,
  compact = false,
  subtle = false,
}: {
  rank?: string | null;
  compact?: boolean;
  subtle?: boolean;
}) {
  const displayRank = getDisplayRank(rank);
  const important = isImportantRank(rank);

  if (!important && subtle) {
    return (
      <span className="inline-flex max-w-full items-center rounded bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        <span className="truncate">{displayRank}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full border font-bold shadow-sm ${
        compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs uppercase tracking-wide'
      } ${
        important
          ? 'border-accent/40 bg-accent/15 text-accent dark:border-accent/60 dark:bg-accent/20 dark:text-yellow-100'
          : 'border-gray-200 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
      }`}
      title={important ? `${displayRank} leadership rank` : displayRank}
    >
      {important && <ShieldCheck size={compact ? 13 : 14} className="shrink-0" />}
      <span className="truncate">{displayRank}</span>
    </span>
  );
}
