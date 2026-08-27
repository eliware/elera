import { inspectDataDirectory } from './data-directory.mjs';

const [, , directory, bootstrapValue] = process.argv;
if (!directory) throw new Error('data directory is required');
const result = inspectDataDirectory(directory, { bootstrap: bootstrapValue === 'true' });
if (result.action === 'fail') {
  console.error(result.message);
  console.log('fail');
} else {
  console.log(result.action);
}
