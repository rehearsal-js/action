import { getInput, setFailed } from '@actions/core';

import { resolve } from 'path';
import { cli } from '@rehearsal/cli';

export function run(): void {
  const srcDir = getInput('src_dir') || '.';

  try {
    cli.parse(['node', 'rehearsal', 'upgrade', `-s=${resolve(srcDir)}`]);
  } catch (error) {
    setFailed((error as Error).message);
  }
}

run();
