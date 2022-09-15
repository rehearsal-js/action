import { getInput, setFailed } from '@actions/core';
import { getExecOutput as exec } from '@actions/exec';
import { create as glob } from '@actions/glob';
import { context } from '@actions/github';
import { resolve } from 'path';

export async function run(): Promise<void> {
  const basePath = getInput('base-path') || '.';
  const githubToken = getInput('github-token') || '';
  const gitUserName = getInput('git-user-name') || 'rehearsal[bot]';
  const gitUserEmail = getInput('git-user-email') || 'rehearsal[bot]@users.noreply.github.com';

  const branchName = 'rehearsal-bot/upgrade/xxx';
  const commitMessage = 'chore: Upgrade ...';
  const stashMessage = 'rehearsal-bot';

  const baseDir = resolve(basePath);

  try {
    console.log('Upgrade started');

    try {
      await exec('ls', ['-la']);

      await exec('yarn', ['install']); // OR NPM

      // If repo is dirty - stash or commit changes (use param)
      console.log('Checking is repo is dirty');
      await exec('git', ['status']);

      // Stash any changes in the repo after `yarn install`
      console.log('Stashing all local changes');
      await exec('git', ['stash', 'push', '-m', stashMessage]);

      // Run rehearsal to have files updated
      // Rehearsal? Pin the original TS version and run yarn install
      console.log('Running Rehearsal Upgrade');
      // TODO: Run bundled index.js
      await exec('yarn', ['global', 'add', 'typescript']); // OR NPM
      await exec('yarn', ['global', 'add', '@rehearsal/cli']); // OR NPM
      await exec('rehearsal', ['upgrade', '--dry_run', '-s', baseDir]);

      /*
      await rehearsal.parseAsync([
        'node',
        'rehearsal',
        'upgrade',
        '--dry_run',
        '--src_dir',
        baseDir,
      ]);
      */
      console.log('Checking for changes made by Rehearsal');
      console.log(await exec('git', ['status']));

      // Create a commit with all updated files
      console.log('Committing changes');
      console.log(await exec('git', ['config', 'user.name', gitUserName]));
      console.log(await exec('git', ['config', 'user.email', gitUserEmail]));
      console.log(await exec('git', ['commit', '-m', commitMessage]));

      // Pushing changes to the remote Rehearsal's branch
      console.log('Pushing changes to origin');
      console.log(await exec('git', ['push', 'origin', branchName, '--force']));

      // Create PR is it's not exists
      console.log(githubToken);
      console.log(context);

      console.log(await glob('yarn.lock'));
      /*
      const newIssue = await getOctokit().rest.issues.create({
        ...context.repo,
        title: 'New issue!',
        body: 'Hello Universe!'
      });
      */
    } catch (_) {
      console.log('Upgrade finished');
    }
  } catch (error) {
    setFailed((error as Error).message);
  }
}

run();
