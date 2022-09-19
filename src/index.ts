import {endGroup, getInput, setFailed, startGroup} from '@actions/core';
import { exec } from '@actions/exec';
import { create as createGlobber } from '@actions/glob';
import { context, getOctokit } from '@actions/github';
import { resolve } from 'path';
import { RequestError } from '@octokit/request-error';

export async function run(): Promise<void> {
  const basePath = getInput('base-path') || '.';
  const githubToken = getInput('github-token') || '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';
  const gitUserName = getInput('git-user-name') || 'rehearsal[bot]';
  const gitUserEmail = getInput('git-user-email') || 'rehearsal[bot]@users.noreply.github.com';

  const branchName = 'rehearsal-bot/upgrade';
  const commitMessage = 'chore: Upgrade ...';
  const stashMessage = 'rehearsal-bot';

  const baseDir = resolve(basePath);

  const defaultBranchName = 'master';

  try {
    startGroup('Upgrade started');

    // Installing project dependencies
    console.log('\nStashing all local changes');
    if (await isYarnManager()) {
      await exec('yarn', ['install']);
      await exec('yarn', ['global', 'add', 'typescript']);
      await exec('yarn', ['global', 'add', '@rehearsal/cli@0.0.34']);
    } else {
      await exec('npm', ['install']);
      await exec('npm', ['-g', 'install', 'typescript']);
      await exec('npm', ['-g', 'install', '@rehearsal/cli@0.0.34']);
    }
    endGroup();

    // Stash any changes in the repo after dependencies installation
    startGroup('\nStashing all local changes');
    await exec('git', ['stash', 'push', '-m', stashMessage], { ignoreReturnCode: true });
    endGroup();

    // Run rehearsal to have files updated
    // TODO: Bundled rehearsal package to index.js and run use: rehearsal.parseAsync(['node', 'rehearsal', 'upgrade', '-s', baseDir]);
    console.log('\nRunning Rehearsal Upgrade');
    //await exec('rehearsal', ['upgrade', '--dry_run', `-s "${baseDir}"`]);

    // Create a commit with all updated files (except updated package.json and yarn.lock)
    console.log('\nCommitting changes');
    await exec('git', ['add', '.'], { ignoreReturnCode: true });
    await exec('git', ['reset', '--', 'package.json', 'package-lock.json', 'yarn.lock']);
    await exec(
      'git',
      [
        '-c',
        `user.name="${gitUserName}"`,
        '-c',
        `user.email="${gitUserEmail}"`,
        'commit',
        '-m',
        `"${commitMessage}"`,
      ],
      { ignoreReturnCode: true }
    );

    // Pushing changes to the remote Rehearsal's branch
    console.log('\nPushing changes to origin');
    await exec('git', ['push', 'origin', `${defaultBranchName}:${branchName}`, '--force']);

    console.log('\nCreating Pull Request');
    const octokit = getOctokit(githubToken);
    
    
    octokit.rest.pulls.create({
      ...context.repo,
      title: commitMessage,
      head: branchName,
      base: 'master',
      body: 'Body...',
      draft: true,
    });

    console.log('\nUpgrade finished');
  } catch (error) {
    if (error instanceof RequestError) {
      console.log('Pull Request is already exists');
    } else {
      setFailed((error as Error).message);
    }
  }
}

run();

async function isYarnManager(): Promise<boolean> {
  const globber = await createGlobber('**/yarn.lock');
  const files = await globber.glob();

  return files.length > 0;
}
