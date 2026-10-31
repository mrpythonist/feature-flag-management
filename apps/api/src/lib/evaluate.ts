import { createHash } from 'node:crypto';

/**
 * Flag evaluation — deterministic, LaunchDarkly-style.
 *
 * Rules, in priority order:
 *  1. config disabled           -> false, "disabled"
 *  2. userId in targetedUsers   -> true,  "targeted"
 *  3. percentage rollout bucket -> maybe true, "rollout"
 *  4. otherwise                 -> false, "default"
 *  (no userId -> enabled-only evaluation, "no-user")
 *
 * The rollout bucket hashes (flagKey + ":" + userId) with SHA-256 and takes
 * the first 8 hex chars (32 bits) modulo 100. Same flag+user always lands in
 * the same bucket, so a rollout is stable across requests and restarts, and
 * different flags hash independently (no correlated buckets).
 */
export type EvalReason = 'disabled' | 'targeted' | 'rollout' | 'default' | 'no-user';

export interface FlagConfigLike {
  enabled: boolean;
  rolloutPercentage: number;
  targetedUsers: string[];
}

export interface EvaluationResult {
  enabled: boolean;
  reason: EvalReason;
}

/** Stable rollout bucket in [0, 100) for a flag+user pair. */
export function rolloutBucket(flagKey: string, userId: string): number {
  const hex = createHash('sha256').update(`${flagKey}:${userId}`).digest('hex');
  return parseInt(hex.slice(0, 8), 16) % 100;
}

export function evaluateFlag(
  flagKey: string,
  userId: string | null | undefined,
  config: FlagConfigLike,
): EvaluationResult {
  if (!config.enabled) {
    return { enabled: false, reason: 'disabled' };
  }
  if (!userId) {
    return { enabled: true, reason: 'no-user' };
  }
  if (config.targetedUsers.includes(userId)) {
    return { enabled: true, reason: 'targeted' };
  }
  if (config.rolloutPercentage > 0 && rolloutBucket(flagKey, userId) < config.rolloutPercentage) {
    return { enabled: true, reason: 'rollout' };
  }
  return { enabled: false, reason: 'default' };
}
