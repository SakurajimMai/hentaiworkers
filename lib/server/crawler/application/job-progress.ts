export function readClaimSkipReason(progressJson: string | null): string | null {
  if (!progressJson) return null;
  try {
    const progress = JSON.parse(progressJson) as Record<string, unknown>;
    return typeof progress.claimSkipReason === 'string' && progress.claimSkipReason.trim()
      ? progress.claimSkipReason.trim()
      : null;
  } catch {
    return null;
  }
}
