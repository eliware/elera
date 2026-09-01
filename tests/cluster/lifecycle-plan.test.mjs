import { expect, test } from '@jest/globals';
import { planLifecycle } from '../../src/cluster/lifecycle-plan.mjs';

const local = 'elera-0.example.test';
const peer = 'elera-1.example.test';

test('plans bootstrap and join eligibility', () => {
  expect(planLifecycle('bootstrap', { enabled: true, ready: false, quorum: false, nodeId: local, state: 'Offline' }).eligible).toBe(true);
  expect(planLifecycle('join', { enabled: true, ready: false, quorum: true, nodeId: local, target: peer, state: 'Offline' }).eligible).toBe(true);
});

test('rejects unsafe lifecycle actions and non-FQDN identities', () => {
  expect(() => planLifecycle('bad', {})).toThrow();
  expect(planLifecycle('bootstrap', { enabled: false }).eligible).toBe(false);
  expect(planLifecycle('join', { enabled: true, ready: false, quorum: false }).reason).toContain('identity');
  expect(planLifecycle('leave', { enabled: true, ready: true, synced: false, quorum: true, nodeId: local, target: peer }).eligible).toBe(false);
  expect(planLifecycle('recover', { enabled: true, ready: false, quorum: false, nodeId: local, target: peer }).eligible).toBe(false);
  expect(planLifecycle('bootstrap', { enabled: true, ready: false, quorum: false, nodeId: 'elera-0', state: 'Offline' }).eligible).toBe(false);
});

test('covers lifecycle rejection reasons and eligible leave/recovery', () => {
  expect(planLifecycle('bootstrap', { enabled: true, ready: true, nodeId: local }).reason).toContain('already');
  expect(planLifecycle('bootstrap', { enabled: true, ready: false, quorum: true, nodeId: local }).reason).toContain('quorum');
  expect(planLifecycle('join', { enabled: true, ready: true, quorum: true, nodeId: local, target: peer }).reason).toContain('already');
  expect(planLifecycle('join', { enabled: true, ready: false, quorum: false, nodeId: local, target: peer }).reason).toContain('established');
  expect(planLifecycle('leave', { enabled: true, ready: false, synced: true, quorum: true, nodeId: local, target: peer }).reason).toContain('ready');
  expect(planLifecycle('leave', { enabled: true, ready: true, synced: true, quorum: false, nodeId: local, target: peer }).reason).toContain('quorum');
  expect(planLifecycle('leave', { enabled: true, ready: true, synced: true, quorum: true, nodeId: local, target: peer }).eligible).toBe(true);
  expect(planLifecycle('recover', { enabled: true, ready: true, quorum: true, nodeId: local, target: peer }).reason).toContain('offline');
  expect(planLifecycle('recover', { enabled: true, ready: false, quorum: true, nodeId: local, target: peer, state: 'Offline' }).eligible).toBe(true);
  expect(planLifecycle('join', { enabled: true, ready: false, quorum: true, nodeId: local, target: peer, state: 'Initialized' }).reason).toContain('startup recovery');
});
