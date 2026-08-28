import { expect, jest, test } from '@jest/globals';
import { filterReachableNodes } from '../../src/routing/address-validation.mjs';

test('keeps resolvable nodes and excludes unreachable addresses', async () => { const log = { warn: jest.fn() }; const nodes = [{ address: 'ok' }, { address: 'bad' }]; const result = await filterReachableNodes(nodes, { resolve: async (host) => { if (host === 'bad') throw new Error('dns'); }, log }); expect(result).toEqual([nodes[0]]); expect(log.warn).toHaveBeenCalledWith('Routing address is unreachable', expect.objectContaining({ host: 'bad' })); });
test('uses the system resolver when no resolver is supplied', async () => { await expect(filterReachableNodes([{ address: 'localhost' }])).resolves.toHaveLength(1); });
