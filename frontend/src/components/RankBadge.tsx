import { BadgeCheck, ChevronsUp, Crown, Eye, Medal, Shield, ShieldCheck, Sparkles, Star } from 'lucide-react';
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

const rankStyles = {
  trooper: {
    icon: Shield,
    className: 'shield-rank-badge shield-rank-trooper border-sky-300/70 bg-sky-50 text-sky-900 dark:border-sky-700/70 dark:bg-sky-950/45 dark:text-sky-100',
    title: 'Trooper rank',
  },
  'master trooper': {
    icon: Medal,
    className: 'shield-rank-badge shield-rank-master-trooper border-blue-300/70 bg-blue-50 text-blue-900 dark:border-blue-700/80 dark:bg-blue-950/50 dark:text-blue-100',
    title: 'Master Trooper rank',
  },
  detective: {
    icon: Eye,
    className: 'shield-rank-badge shield-rank-detective border-indigo-300/70 bg-indigo-50 text-indigo-900 dark:border-indigo-700/70 dark:bg-indigo-950/45 dark:text-indigo-100',
    title: 'Detective rank',
  },
  sergeant: {
    icon: ChevronsUp,
    className: 'shield-rank-badge shield-rank-sergeant shield-rank-command border-amber-300/80 bg-amber-50 text-amber-900 dark:border-amber-600/70 dark:bg-amber-950/45 dark:text-amber-100',
    title: 'Sergeant leadership rank',
  },
  'first sergeant': {
    icon: BadgeCheck,
    className: 'shield-rank-badge shield-rank-first-sergeant shield-rank-command border-yellow-400/80 bg-yellow-50 text-yellow-950 dark:border-yellow-500/70 dark:bg-yellow-950/45 dark:text-yellow-100',
    title: 'First Sergeant leadership rank',
  },
  lieutenant: {
    icon: ShieldCheck,
    className: 'shield-rank-badge shield-rank-lieutenant shield-rank-command border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-500/70 dark:bg-slate-900/70 dark:text-slate-100',
    title: 'Lieutenant command rank',
  },
  captain: {
    icon: Star,
    className: 'shield-rank-badge shield-rank-captain shield-rank-command shield-rank-metal border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-500/70 dark:bg-blue-950/55 dark:text-blue-100',
    title: 'Captain command rank',
  },
  colonel: {
    icon: Crown,
    className: 'shield-rank-badge shield-rank-colonel shield-rank-command shield-rank-metal border-yellow-400/80 bg-yellow-50 text-yellow-950 dark:border-yellow-500/75 dark:bg-yellow-950/55 dark:text-yellow-100',
    title: 'Colonel command rank',
  },
  superintendent: {
    icon: Sparkles,
    className: 'shield-rank-badge shield-rank-superintendent shield-rank-command shield-rank-metal shield-rank-executive border-yellow-300 bg-white text-primary-500 dark:border-yellow-300/80 dark:bg-slate-950 dark:text-white',
    title: 'Superintendent executive command rank',
  },
} as const;

type KnownRankKey = keyof typeof rankStyles;

function getRankStyle(rank?: string | null) {
  const key = normalizeRank(rank) as KnownRankKey;
  return rankStyles[key];
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
  const rankStyle = getRankStyle(rank);
  const important = isImportantRank(rank);

  if (!rankStyle && subtle) {
    return (
      <span className="inline-flex max-w-full items-center rounded bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        <span className="truncate">{displayRank}</span>
      </span>
    );
  }

  const Icon = rankStyle?.icon || Shield;

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 overflow-hidden rounded-full border font-black shadow-sm transition ${
        compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs uppercase tracking-wide'
      } ${
        rankStyle?.className || 'shield-rank-badge border-gray-200 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
      }`}
      title={rankStyle?.title || (important ? `${displayRank} leadership rank` : displayRank)}
    >
      <span className="shield-rank-icon flex shrink-0 items-center justify-center">
        <Icon size={compact ? 13 : 14} />
      </span>
      <span className="truncate">{displayRank}</span>
    </span>
  );
}
