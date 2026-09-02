import { expect, jest, test } from '@jest/globals';
import { recordSupervisorRecoveryDecision } from '../../src/runtime/recovery-decision.mjs';

test('records recovery evidence, winner, state, and durable decision', async () => {
  const recoveryAudit = { evidence: jest.fn(), winner: jest.fn() }; const recoveryState = { set: jest.fn() }; const store = { write: jest.fn() }; const decision = { mode: 'bootstrap', reason: 'winner', epoch: 3, winner: 'node-a.example.test', evidence: [{ node: 'node-a.example.test' }] };
  await expect(recordSupervisorRecoveryDecision({ decision, recoveryState, recoveryAudit, environment: {}, createStore: () => store })).resolves.toBe(decision);
  expect(recoveryAudit.evidence).toHaveBeenCalledWith({ nodes: 1, mode: 'bootstrap' }); expect(recoveryAudit.winner).toHaveBeenCalledWith({ winner: 'node-a.example.test', epoch: 3 }); expect(recoveryState.set).toHaveBeenCalledWith('awaiting-quorum', { reason: 'winner', epoch: 3 }); expect(store.write).toHaveBeenCalledWith(decision);
});

test('records join and blocked decisions without a winner', async () => { const recoveryState = { set: jest.fn() }; const recoveryAudit = { evidence: jest.fn(), winner: jest.fn() }; const store = { write: jest.fn() }; await recordSupervisorRecoveryDecision({ decision: { mode: 'join', reason: 'join' }, recoveryState, recoveryAudit, createStore: () => store }); await recordSupervisorRecoveryDecision({ decision: { mode: 'blocked', reason: 'ambiguous' }, recoveryState, recoveryAudit, createStore: () => store }); expect(recoveryState.set).toHaveBeenNthCalledWith(1, 'joining', expect.any(Object)); expect(recoveryState.set).toHaveBeenNthCalledWith(2, 'blocked-ambiguous', expect.any(Object)); expect(recoveryAudit.winner).not.toHaveBeenCalled(); });
