import { jest } from '@jest/globals';
import { createRecoveryAudit } from '../../../src/cluster/cold-bootstrap/audit.mjs';

test('emits structured recovery audit events', () => {
  const log = { info: jest.fn(), error: jest.fn() }; const audit = createRecoveryAudit(log);
  audit.evidence({ nodes: 3 }); audit.winner({ winner: 'elera-1.example.test' }); audit.lease({ granted: true }); audit.lease({ granted: false }); audit.authorization({ epoch: 'e' }); audit.failure({ reason: 'timeout' });
  expect(log.info.mock.calls.map(([event]) => event)).toEqual(['cold-recovery.evidence-collected', 'cold-recovery.winner-selected', 'cold-recovery.lease-acquired', 'cold-recovery.lease-rejected', 'cold-recovery.bootstrap-authorized']);
  expect(log.error).toHaveBeenCalledWith('cold-recovery.failed', { reason: 'timeout' });
});

test('forwards protocol events into the structured audit stream', () => {
  const log = { info: jest.fn(), warn: jest.fn() };
  const audit = createRecoveryAudit(log);
  audit.event({ type: 'recovery.bootstrap-complete', epoch: 'e1' });
  audit.event({ type: 'recovery.refused', code: 'AMBIGUOUS' });
  expect(log.info).toHaveBeenCalledWith('cold-recovery.bootstrap-complete', { type: 'recovery.bootstrap-complete', epoch: 'e1' });
  expect(log.warn).toHaveBeenCalledWith('cold-recovery.refused', { type: 'recovery.refused', code: 'AMBIGUOUS' });
});

test('records all recovery lifecycle audit events', () => {
  const log = { info: jest.fn(), error: jest.fn() };
  const audit = createRecoveryAudit(log);
  audit.bootstrapStart({ epoch: 'e1' });
  audit.completion({ epoch: 'e1' });
  audit.joinStart({ node: 'elera-1.example.test' });
  audit.joinComplete({ node: 'elera-1.example.test' });
  expect(log.info.mock.calls.map(([event]) => event)).toEqual([
    'cold-recovery.bootstrap-started',
    'cold-recovery.bootstrap-completed',
    'cold-recovery.join-started',
    'cold-recovery.join-completed',
  ]);
});

test('uses the error channel for recovery failures', () => {
  const log = { error: jest.fn() };
  const audit = createRecoveryAudit(log);
  audit.failure({ code: 'RECOVERY_EVIDENCE_UNAVAILABLE' });
  expect(log.error).toHaveBeenCalledWith('cold-recovery.failed', { code: 'RECOVERY_EVIDENCE_UNAVAILABLE' });
});
test('tolerates absent optional log methods', () => {
  const audit = createRecoveryAudit({});
  expect(() => audit.event({ type: 'recovery.evidence-collected' })).not.toThrow();
  expect(() => createRecoveryAudit().event({ type: 'recovery.refused' })).not.toThrow();
  expect(() => createRecoveryAudit({ info: jest.fn() }).event({})).not.toThrow();
});
