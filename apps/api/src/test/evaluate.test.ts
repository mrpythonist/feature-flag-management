import { evaluateFlag, rolloutBucket } from '../lib/evaluate';

/**
 * Unit checks for the flag evaluation engine (determinism + rollout math).
 * Run with: npm run test:evaluate
 * Exits non-zero on the first failure.
 */

let failures = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`ok   ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

const disabled = { enabled: false, rolloutPercentage: 50, targetedUsers: [] as string[] };

// 1. Disabled config -> always off, regardless of targeting/rollout.
check('disabled: non-targeted user', evaluateFlag('f', 'user_1', disabled), {
  enabled: false,
  reason: 'disabled',
});
check('disabled: targeted user', evaluateFlag('f', 'user_1', { ...disabled, targetedUsers: ['user_1'] }), {
  enabled: false,
  reason: 'disabled',
});

// 2. Targeting wins over rollout.
check('targeted user enabled', evaluateFlag('f', 'user_1', { enabled: true, rolloutPercentage: 0, targetedUsers: ['user_1'] }), {
  enabled: true,
  reason: 'targeted',
});
check('untargeted user, 0% rollout', evaluateFlag('f', 'user_2', { enabled: true, rolloutPercentage: 0, targetedUsers: ['user_1'] }), {
  enabled: false,
  reason: 'default',
});

// 3. Determinism: same flag+user -> same bucket across repeated calls.
const buckets = new Set(
  Array.from({ length: 1000 }, () => rolloutBucket('new_checkout', 'user_42')),
);
check('rolloutBucket deterministic', buckets.size, 1);

// 4. Bucket distribution: 50% rollout over 10k synthetic users should land
//    within a tight tolerance of 50% (binomial sigma ~0.5pp, allow ±2pp).
const SAMPLE = 10_000;
let enabledCount = 0;
for (let i = 0; i < SAMPLE; i += 1) {
  const userId = `user_${i}`;
  const { enabled } = evaluateFlag('new_checkout', userId, {
    enabled: true,
    rolloutPercentage: 50,
    targetedUsers: [],
  });
  if (enabled) enabledCount += 1;
}
const pct = (enabledCount / SAMPLE) * 100;
console.log(`info rollout distribution: ${enabledCount}/${SAMPLE} enabled (${pct.toFixed(2)}%)`);
check('rollout ≈ 50% (±2pp)', Math.abs(pct - 50) <= 2, true);

// 5. 0% and 100% rollouts behave as absolute off/on for every sampled user.
let allOff = true;
let allOn = true;
for (let i = 0; i < 1000; i += 1) {
  const userId = `u_${i}`;
  if (evaluateFlag('f', userId, { enabled: true, rolloutPercentage: 0, targetedUsers: [] }).enabled) allOff = false;
  if (!evaluateFlag('f', userId, { enabled: true, rolloutPercentage: 100, targetedUsers: [] }).enabled) allOn = false;
}
check('0% rollout disables all', allOff, true);
check('100% rollout enables all', allOn, true);

// 6. Buckets differ across flags for the same user (no correlated rollouts).
let sameBucket = 0;
for (let i = 0; i < 1000; i += 1) {
  if (rolloutBucket('flag_a', `u_${i}`) === rolloutBucket('flag_b', `u_${i}`)) sameBucket += 1;
}
check('flags bucket independently (≈1% collision, allow <5%)', sameBucket / 1000 < 0.05, true);

// 7. Missing user skips targeting/rollout; honors the master switch.
check('no user, enabled', evaluateFlag('f', null, { enabled: true, rolloutPercentage: 100, targetedUsers: [] }), {
  enabled: true,
  reason: 'no-user',
});
check('no user, disabled', evaluateFlag('f', undefined, disabled), {
  enabled: false,
  reason: 'disabled',
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll evaluate.ts checks passed.');
