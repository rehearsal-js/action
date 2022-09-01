import { getBooleanInput, getInput, group, info, setFailed } from '@actions/core';
import { getExecOutput as exec } from '@actions/exec';
import { context, getOctokit } from '@actions/github';
import { resolve } from 'path';

import { detectPackageManager } from './pm';

export async function run(): Promise<void> {
  const basePath = getInput('base-path') || '.';
  const githubToken = getInput('github-token', { required: true });
  const gitUserName = getInput('git-user-name');
  const gitUserEmail = getInput('git-user-email');
  const pullBranch = getInput('pull-request-branch');
  const pullDraft = getBooleanInput('pull-request-draft');

  try {
    await group('Install project dependencies', async () => {
      const pm = await detectPackageManager();
      switch (pm) {
        case 'yarn': {
          await exec('yarn', ['install']);
          await exec('yarn', ['global', 'add', 'typescript']);
          await exec('yarn', ['global', 'add', '@rehearsal/cli']);
          break;
        }
        case 'pnpm': {
          await exec('pnpm', ['install']);
          await exec('pnpm', ['add', '-g', 'typescript']);
          await exec('pnpm', ['add', '-g', '@rehearsal/cli']);
          break;
        }
        case 'npm': {
          await exec('npm', ['install']);
          await exec('npm', ['install', '-g', 'typescript']);
          await exec('npm', ['install', '-g', '@rehearsal/cli']);
        }
      }
    });

    const baseDir = resolve(basePath);

    await group('Run Rehearsal Upgrade', async () => {
      await exec('rehearsal', ['upgrade', baseDir, '--report', 'json,sarif', '--dryRun']);
    });

    const defaultBranch = context.payload?.repository?.default_branch as string;
    const pullInfo = await generatePullRequestTitleAndBody(baseDir);

    await group('Commit changes (except package.json and *.lock files)', async () => {
      await exec('git', ['add', '.'], { ignoreReturnCode: true });
      await exec('git', ['reset', '--', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);
      await exec(
        'git',
        [
          '-c',
          `user.name="${gitUserName}"`,
          '-c',
          `user.email="${gitUserEmail}"`,
          'commit',
          '-m',
          `"${pullInfo.title}"`,
        ],
        { ignoreReturnCode: true }
      );
    });

    await group(`Push changes to the ${pullBranch} branch`, async () => {
      await exec('git', ['push', 'origin', `${defaultBranch}:${pullBranch}`, '--force']);
    });

    await group(`Create Pull Request`, async () => {
      try {
        const pulls = getOctokit(githubToken).rest.pulls;
        const pullBase = { ...context.repo, base: defaultBranch, head: pullBranch };

        const response = await pulls.list({ ...pullBase, state: 'open' });
        const pullNumber = response.data?.shift()?.number;

        if (pullNumber) {
          pulls.update({ ...pullBase, ...pullInfo, pull_number: pullNumber });
          info(`Pull Request '${pullInfo.title}' updated`);
        } else {
          pulls.create({ ...pullBase, ...pullInfo, draft: pullDraft });
          info(`Pull Request '${pullInfo.title}' created`);
        }
      } catch (error) {
        const message = (error as any)?.response?.data?.errors?.shift()?.message?.toLowerCase() || '';
        if (message.includes('already exists') || message.includes('no commits between')) {
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

/**
 * Generates a Pull Request description based on the report provided by Rehearsal
 */
async function generatePullRequestTitleAndBody(baseDir: string): Promise<{ title: string; body: string }> {
  const report = await import(resolve(baseDir, '.rehearsal', 'report.json'));

  console.log(report?.summary);
  console.log(report?.items);

  const tsVersion = report?.summary?.tsVersion?.split('-')?.shift(); // Version without `beta` suffix

  type TableRow = { error: string; file: string; message: string; code: string };

  const items = report?.items || [];
  const tables: { fixed: TableRow[]; todos: TableRow[] } = { fixed: [], todos: [] };

  for (const item of items) {
    const target = item?.fixed ? tables.fixed : tables.todos;

    target.push({
      error: item?.errorCode,
      file: item?.analysisTarget?.slice(item?.summary?.basePath?.length || 0),
      message: item?.hint || item?.message,
      code: item?.nodeText?.trim(),
    });
  }

  const title = `chore(rehearsal): Upgrade the code for TypeScript ${tsVersion}`;

  let body = ``;

  body += `### Summary:\n`;
  body += `Typescript Version: ${tsVersion}\n`;
  body += `Files updated: ${report?.summary?.files}\n`;
  body += `\n`;
  body += `### Fixed:\n`;
  body += JSON.stringify(tables.fixed);
  body += `\n`;
  body += `### To do:\n`;
  body += JSON.stringify(tables.todos);

  return { title, body };
}
