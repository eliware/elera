import { expect, jest, test } from '@jest/globals';
import { recoverJoinersSequentially } from '../../src/runtime/sequential-joiners.mjs';

const members = [{ name: 'node-b' }, { name: 'node-c' }];

test('starts and verifies joiners sequentially before publishing recovery', async () => {
  const order = [];
  const state = { set: jest.fn() };
  const publishRecovery = jest.fn();
  await expect(recoverJoinersSequentially({ joiners: members, startJoiner: async (member) => order.push(`start:${member.name}`), verifyJoiner: async (member) => { order.push(`verify:${member.name}`); return { valid: true }; }, recoveryState: state, recoveryAudit: { joinComplete: jest.fn() }, publishRecovery })).resolves.toEqual({ completed: ['node-b', 'node-c'] });
  expect(order).toEqual(['start:node-b', 'verify:node-b', 'start:node-c', 'verify:node-c']);
  expect(publishRecovery).toHaveBeenCalledWith({ members: ['node-b', 'node-c'] });
  expect(state.set).toHaveBeenLastCalledWith('complete', expect.any(Object));
});

test('stops before the next joiner when verification fails', async () => {
  const started = [];
  const state = { set: jest.fn() };
  const publishRecovery = jest.fn();
  await expect(recoverJoinersSequentially({ joiners: members, startJoiner: async (member) => started.push(member.name), verifyJoiner: async (member) => member.name === 'node-b' ? { valid: true } : { valid: false, reason: 'UUID mismatch' }, recoveryState: state, recoveryAudit: { failure: jest.fn() }, publishRecovery, log: { error: jest.fn() } })).rejects.toMatchObject({ code: 'JOINER_NOT_READY', node: 'node-c' });
  expect(started).toEqual(['node-b', 'node-c']);
  expect(publishRecovery).not.toHaveBeenCalled();
  expect(state.set).toHaveBeenLastCalledWith('cluster-unavailable', expect.objectContaining({ node: 'node-c', completed: ['node-b'] }));
});

test('rejects incomplete coordinator dependencies', async () => {
  await expect(recoverJoinersSequentially({ joiners: members })).rejects.toThrow('dependencies are required');
});

test('uses the authenticated recovery join client when no start callback is supplied', async () => {
  const join = jest.fn().mockResolvedValue({ status: 'joining' });
  const verifyJoiner = jest.fn().mockResolvedValue({ valid: true });
  await expect(recoverJoinersSequentially({ joiners: [{ name: 'node-b', url: 'http://node-b' }], joinClient: { join }, verifyJoiner })).resolves.toEqual({ completed: ['node-b'] });
  expect(join).toHaveBeenCalledWith({ name: 'node-b', url: 'http://node-b' });
});

test('supports omitted optional state, audit, logging, and publication hooks', async () => {
  await expect(recoverJoinersSequentially({ joiners: [], startJoiner: jest.fn(), verifyJoiner: jest.fn() })).resolves.toEqual({ completed: [] });
});

test('still fails cleanly when logging is not configured', async () => {
  await expect(recoverJoinersSequentially({ joiners: [{ name: 'node-b' }], startJoiner: jest.fn(), verifyJoiner: jest.fn().mockResolvedValue({ valid: false }) })).rejects.toMatchObject({ code: 'JOINER_NOT_READY' });
});
