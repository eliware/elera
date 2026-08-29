import { jest } from '@jest/globals';
import { createRecoveryAudit } from '../../../src/cluster/cold-bootstrap/audit.mjs';

test('emits structured recovery audit events', () => {
  const log = { info: jest.fn(), error: jest.fn() }; const audit = createRecoveryAudit(log);
  audit.evidence({ nodes: 3 }); audit.winner({ winner: 'elera-1' }); audit.lease({ granted: true }); audit.lease({ granted: false }); audit.authorization({ epoch: 'e' }); audit.failure({ reason: 'timeout' });
  expect(log.info.mock.calls.map(([event]) => event)).toEqual(['cold-recovery.evidence-collected', 'cold-recovery.winner-selected', 'cold-recovery.lease-acquired', 'cold-recovery.lease-rejected', 'cold-recovery.bootstrap-authorized']);
  expect(log.error).toHaveBeenCalledWith('cold-recovery.failed', { reason: 'timeout' });
});
