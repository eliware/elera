import { expect, test } from '@jest/globals';
import { recoveryStartupDecision } from '../../src/runtime/recovery-startup-decision.mjs';

test.each([
  [{ mode: 'join', reason: 'joined', evidence: {} }, { mode: 'join', epoch: null, bootstrapComplete: true }],
  [{ mode: 'plan', eligible: true, winner: { node: 'n1' }, reason: 'winner', epoch: 4, evidence: {} }, { mode: 'bootstrap', winner: 'n1', localWinner: true, epoch: 4 }],
  [{ mode: 'plan', eligible: false, reason: 'ambiguous', evidence: {} }, { mode: 'blocked', epoch: null }],
])('maps recovery plan to startup decision', (plan, expected) => expect(recoveryStartupDecision(plan, 'n1')).toEqual(expect.objectContaining(expected)));
