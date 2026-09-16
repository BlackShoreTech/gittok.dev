// Purpose: Shared display formatting for repository metadata
// Context: Used by feed cards so numbers and dates read consistently everywhere

/** 987 → "987", 12_400 → "12.4k", 1_250_000 → "1.2M" */
export function formatCount(num: number): string {
	if (!Number.isFinite(num) || num < 0) return '0';
	if (num < 1000) return String(num);
	if (num < 10_000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}k`;
	if (num < 1_000_000) return `${Math.round(num / 1000)}k`;
	return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/** Compact, human relative time: "today", "3d ago", "5mo ago", "2y ago" */
export function timeAgo(iso: string): string {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return '';

	const days = Math.floor((Date.now() - then) / 86_400_000);
	if (days <= 0) return 'today';
	if (days === 1) return 'yesterday';
	if (days < 30) return `${days}d ago`;
	if (days < 365) return `${Math.floor(days / 30)}mo ago`;
	return `${Math.floor(days / 365)}y ago`;
}

/** True when the repo was pushed to recently enough to be worth flagging. */
export function isActive(iso: string): boolean {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return false;
	return Date.now() - then < 30 * 86_400_000;
}
