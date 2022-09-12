import { getInput, setFailed } from '@actions/core';

import { execaSync } from 'execa';
import { resolve } from 'path';
import { rehearsal } from '@rehearsal/cli';
import { a } from './test';

export function run(): void {
  const srcDir = getInput('src_dir') || '.';
  const gitUserName = getInput('git_user_name') || 'rehearsal[bot]';
  const gitUserEmail = getInput('git_user_email') || 'rehearsal[bot]@users.noreply.github.com';

  try {
    console.log(execaSync('yarn', ['install']).stdout); // OR NPM

    console.log(execaSync('ls', ['-la']).stdout);

    console.log(execaSync('git', ['config', 'user.name', gitUserName]).stdout);
    console.log(execaSync('git', ['config', 'user.email', gitUserEmail]).stdout);

    console.log(resolve(srcDir));
    console.log(execaSync('git', ['status']).stdout);

    try {
      rehearsal.parse(['node', 'rehearsal', 'upgrade', '--src_dir', resolve(srcDir)]);
    } catch (_) {
      console.log('asdas');
    }

    console.log(execaSync('git', ['status']).stdout);
  } catch (error) {
    setFailed((error as Error).message);
  }
}

a();

run();
