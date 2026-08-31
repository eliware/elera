import { registerHandlers } from '@eliware/common';

export function createSupervisorErrorHandlers({ log } = {}) {
  return registerHandlers({ log, events: ['uncaughtException', 'unhandledRejection', 'warning'] });
}
