import { expect, test } from '@jest/globals';
import { validateRecoveryEvidence } from '../../../src/cluster/cold-bootstrap/evidence-validation.mjs';

const valid = { node: 'elera-0', uuid: 'cluster', seqno: 1, safeToBootstrap: false, active: false, generation: 2, observedAt: '2026-08-29T16:00:00.000Z' };
test('accepts complete fresh evidence', () => expect(validateRecoveryEvidence([valid], { now: new Date('2026-08-29T16:00:01.000Z'), maxAgeMs: 2000 })).toEqual([valid]));
test('accepts explicitly valid data-directory evidence', () => expect(validateRecoveryEvidence([{ ...valid, dataDirectory: { valid: true } }], { now: new Date(valid.observedAt) })).toHaveLength(1));
test('uses the current time when no validation options are supplied', () => { const observedAt = new Date().toISOString(); expect(validateRecoveryEvidence([{ ...valid, observedAt }])).toHaveLength(1); });
test('accepts explicit default validation options', () => { const observedAt = new Date().toISOString(); expect(validateRecoveryEvidence([{ ...valid, observedAt }], { now: undefined, maxAgeMs: undefined })).toHaveLength(1); });
test('rejects missing or empty evidence collections', () => {
  expect(() => validateRecoveryEvidence()).toThrow('complete recovery evidence');
  expect(() => validateRecoveryEvidence([])).toThrow('complete recovery evidence');
  const observedAt = new Date().toISOString();
  expect(validateRecoveryEvidence([{ ...valid, observedAt }], {})).toHaveLength(1);
});
test('rejects missing fields and stale reports', () => {
  expect(() => validateRecoveryEvidence([{ ...valid, seqno: undefined }], { now: new Date(valid.observedAt) })).toThrow('incomplete');
  expect(() => validateRecoveryEvidence([valid], { now: new Date('2026-08-29T16:01:00.000Z'), maxAgeMs: 1000 })).toThrow('stale');
});
test('rejects duplicate or malformed reports', () => {
  const fresh = { ...valid, observedAt: new Date().toISOString() };
  expect(() => validateRecoveryEvidence([fresh, { ...fresh }])).toThrow('malformed');
  expect(() => validateRecoveryEvidence([{ ...fresh, active: 'false' }])).toThrow('malformed');
});
test('rejects each malformed evidence field', () => {
  const fresh = { ...valid, observedAt: new Date().toISOString() };
  for (const item of [
    { ...fresh, node: '' }, { ...fresh, uuid: '' }, { ...fresh, seqno: 1.2 },
    { ...fresh, generation: 0 }, { ...fresh, generation: '1' }, { ...fresh, safeToBootstrap: 1 },
    { ...fresh, active: 1 }, { ...fresh, observedAt: 'invalid' }, { ...fresh, dataDirectory: {} },
  ]) expect(() => validateRecoveryEvidence([item])).toThrow('malformed');
});
