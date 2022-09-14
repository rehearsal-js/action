import { getInput, setFailed, setSecret } from '@actions/core';
import { getExecOutput as exec } from '@actions/exec';
import { context, getOctokit } from '@actions/github';
import { resolve } from 'path';
import { rehearsal } from '@rehearsal/cli';
import { a } from './test';

export function run(): void {
  const basePath = getInput('base-path') || '.';
  const repoToken = getInput('repo-token') || '';
  const gitUserName = getInput('git_user_name') || 'rehearsal[bot]';
  const gitUserEmail = getInput('git_user_email') || 'rehearsal[bot]@users.noreply.github.com';

  const branchName = 'rehearsal-bot/upgrade/xxx';
  const commitMessage = 'chore: Upgrade ...';
  const stashMessage = 'rehearsal-bot';

  const baseDir = resolve(basePath);

  try {
    console.log('Upgrade started');

    try {
      console.log(exec('yarn', ['install'])); // OR NPM

      // If repo is dirty - stash or commit changes (use param)
      console.log('Checking is repo is dirty');
      console.log(exec('git', ['status']));

      // Stash any changes in the repo after `yarn install`
      console.log('Stashing all local changes');
      console.log(exec('git', ['stash', 'push', '-m', stashMessage]));

      // Run rehearsal to have files updated
      // Rehearsal? Pin the original TS version and run yarn install
      rehearsal.parse(['node', 'rehearsal', 'upgrade', '--dry_run', '--src_dir', baseDir]);

      console.log('Checking for changes made by Rehearsal');
      console.log(exec('git', ['status']));

      // Create a commit with all updated files
      console.log('Committing changes');
      console.log(exec('git', ['config', 'user.name', gitUserName]));
      console.log(exec('git', ['config', 'user.email', gitUserEmail]));
      console.log(exec('git', ['commit', '-m', commitMessage]));

      // Pushing changes to the remote Rehearsal's branch
      console.log('Pushing changes to origin');
      console.log(exec('git', ['push', 'origin', branchName, '--force']));

      // Create PR is it's not exists                                 :GITHUB_SECRET needed
      console.log(repoToken);
      console.log(context);

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

a();

run();
