import { getInput, group, info, setFailed } from '@actions/core';
import { getExecOutput as exec } from '@actions/exec';
import { create as createGlobber } from '@actions/glob';
import { context, getOctokit } from '@actions/github';
import { resolve } from 'path';

export async function run(): Promise<void> {
  const basePath = getInput('base-path') || '.';
  const githubToken = getInput('github-token') || '';
  const gitUserName = getInput('git-user-name') || 'rehearsal-bot';
  const gitUserEmail = getInput('git-user-email') || 'rehearsal-bot@users.noreply.github.com';

  const branchName = 'rehearsal-bot/upgrade';
  const commitMessage = 'chore: Upgrade ';
  const pullRequestTitle = commitMessage;

  const baseDir = resolve(basePath);
  const defaultBranchName = context.payload?.repository?.default_branch as string;

  try {
    await group('Install project dependencies', async () => {
      if (await isYarnManager()) {
        await exec('yarn', ['install']);
        await exec('yarn', ['global', 'add', 'typescript']);
        await exec('yarn', ['global', 'add', '@rehearsal/cli@0.0.34']);
      } else {
        await exec('npm', ['install']);
        await exec('npm', ['-g', 'install', 'typescript']);
        await exec('npm', ['-g', 'install', '@rehearsal/cli@0.0.34']);
      }
    });

    await group('Run Rehearsal Upgrade', async () => {
      // TODO: Bundled rehearsal package to index.js and run use: rehearsal.parseAsync(['node', 'rehearsal', 'upgrade', '-s', baseDir]);
      await exec('rehearsal', ['upgrade', '--dry_run', `-s "${baseDir}"`]);
    });

    await group('Commit changes (except package.json and *.lock files)', async () => {
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
    });

    await group(`Push changes to the ${branchName} branch`, async () => {
      await exec('git', ['push', 'origin', `${defaultBranchName}:${branchName}`, '--force']);
    });

    await group(`Create Pull Request`, async () => {
      try {
        const octokit = getOctokit(githubToken);
        await octokit.rest.pulls.create({
          repo: context.repo.repo,
          owner: context.repo.owner,
          head: branchName,
          base: defaultBranchName,
          title: commitMessage,
          body: 'Body...',
        });

        info(`Pull Request '${pullRequestTitle}' created`);
      } catch (error) {
        const message = (error as any)?.response?.data?.errors[0]?.message || '';
        if (message.includes('already exists') || message.includes('No commits between')) {
          info(message);
        } else {
          setFailed((error as Error).message);
        }
      }
    });
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
