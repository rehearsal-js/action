import { getInput, setFailed } from '@actions/core';
import { getExecOutput as exec } from '@actions/exec';
import { create as createGlobber } from '@actions/glob';
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

      if (await isYarnManager()) {
        await exec('yarn', ['install']);
        await exec('yarn', ['global', 'add', 'typescript']);
        await exec('yarn', ['global', 'add', '@rehearsal/cli@0.0.34']);
      } else {
        await exec('npm', ['install']);
        await exec('npm', ['-g', 'install', 'typescript']);
        await exec('npm', ['-g', 'install', '@rehearsal/cli@0.0.34']);
      }

      // If repo is dirty - stash or commit changes (use param)
      console.log('Checking is repo is dirty');
      await exec('git', ['status']);

      // Stash any changes in the repo after dependencies installation
      console.log('Stashing all local changes');
      await exec('git', ['stash', 'push', '-m', stashMessage]);

      // Run rehearsal to have files updated
      // Rehearsal?
      // TODO: Bundled rehearsal package to index.js and run use: rehearsal.parseAsync(['node', 'rehearsal', 'upgrade', '-s', baseDir]);
      console.log('Running Rehearsal Upgrade');
      await exec('rehearsal', ['upgrade', '--dry_run', `-s "${baseDir}"`]);

      console.log('Checking for changes made by Rehearsal');
      await exec('git', ['status']);

      // Create a commit with all updated files
      console.log('Committing changes');(await exec('git', ['add', '.']));
      await exec('git', ['reset', '--', 'package.json', 'package-lock.json', 'yarn.lock']);
      await exec('git', [
        '-c',
        `user.name="${gitUserName}"`,
        '-c',
        `user.email="${gitUserEmail}"`,
        'commit',
        '-m',
        `"${commitMessage}"`,
      ]);

      // Pushing changes to the remote Rehearsal's branch
      console.log('Pushing changes to origin');
      await exec('git', ['push', 'origin', branchName, '--force']);

      // Create PR is it's not exists
      console.log(githubToken);
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

run();

async function isYarnManager(): Promise<boolean> {
  const globber = await createGlobber('**/yarn.lock');
  const files = await globber.glob();

  return files.length > 0;
}
