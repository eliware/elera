import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.name.endsWith('.mjs')) files.push(path);
  }
  return files;
}

test('production supervisor source does not import the application client', async () => {
  const files = await sourceFiles(join(process.cwd(), 'src'));
  const imports = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (source.includes('@eliware/elera-client')) imports.push(file);
  }
  expect(imports).toEqual([]);
});
