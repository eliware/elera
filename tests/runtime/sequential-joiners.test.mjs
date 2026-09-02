import { expect, jest, test } from '@jest/globals';
import { recoverJoinersSequentially } from '../../src/runtime/sequential-joiners.mjs';

const members = [{ name: 'node-b.example.test' }, { name: 'node-c.example.test' }];

test('starts and verifies joiners sequentially before publishing recovery', async () => {
  const order = [];
  const state = { set: jest.fn() };
  const publishRecovery = jest.fn();
  await expect(recoverJoinersSequentially({ joiners: members, startJoiner: async (member) => order.push(`start:${member.name}`), verifyJoiner: async (member) => { order.push(`verify:${member.name}`); return { valid: true }; }, recoveryState: state, recoveryAudit: { joinComplete: jest.fn() }, publishRecovery })).resolves.toEqual({ completed: ['node-b.example.test', 'node-c.example.test'] });
  expect(order).toEqual(['start:node-b.example.test', 'verify:node-b.example.test', 'start:node-c.example.test', 'verify:node-c.example.test']);
  expect(publishRecovery).toHaveBeenCalledWith({ members: ['node-b.example.test', 'node-c.example.test'] });
  expect(state.set).toHaveBeenLastCalledWith('complete', expect.any(Object));
});

test('stops before the next joiner when verification fails', async () => {
  const started = [];
  const state = { set: jest.fn() };
  const publishRecovery = jest.fn();
  await expect(recoverJoinersSequentially({ joiners: members, startJoiner: async (member) => started.push(member.name), verifyJoiner: async (member) => member.name === 'node-b.example.test' ? { valid: true } : { valid: false, reason: 'UUID mismatch' }, recoveryState: state, recoveryAudit: { failure: jest.fn() }, publishRecovery, log: { error: jest.fn() } })).rejects.toMatchObject({ code: 'JOINER_NOT_READY', node: 'node-c.example.test' });
  expect(started).toEqual(['node-b.example.test', 'node-c.example.test']);
  expect(publishRecovery).not.toHaveBeenCalled();
  expect(state.set).toHaveBeenLastCalledWith('cluster-unavailable', expect.objectContaining({ node: 'node-c.example.test', completed: ['node-b.example.test'] }));
});

test('rejects incomplete coordinator dependencies', async () => {
  await expect(recoverJoinersSequentially({ joiners: members })).rejects.toThrow('sequential joiner recovery dependencies');
});

test('uses the authenticated recovery join client when no start callback is supplied', async () => {
  const join = jest.fn().mockResolvedValue({ status: 'joining' });
  const verifyJoiner = jest.fn().mockResolvedValue({ valid: true });
  await expect(recoverJoinersSequentially({ joiners: [{ name: 'node-b.example.test', url: 'http://node-b.example.test' }], joinClient: { join }, verifyJoiner, recoveryState: { set: jest.fn() } })).resolves.toEqual({ completed: ['node-b.example.test'] });
  expect(join).toHaveBeenCalledWith({ name: 'node-b.example.test', url: 'http://node-b.example.test' });
});

test('supports omitted optional state, audit, logging, and publication hooks', async () => {
  await expect(recoverJoinersSequentially({ joiners: [], startJoiner: jest.fn(), verifyJoiner: jest.fn(), recoveryState: { set: jest.fn() } })).resolves.toEqual({ completed: [] });
});

test('still fails cleanly when logging is not configured', async () => {
  await expect(recoverJoinersSequentially({ joiners: [{ name: 'node-b.example.test' }], startJoiner: jest.fn(), verifyJoiner: jest.fn().mockResolvedValue({ valid: false }), recoveryState: { set: jest.fn() } })).rejects.toMatchObject({ code: 'JOINER_NOT_READY' });
});
