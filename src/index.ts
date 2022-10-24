import { getBooleanInput, getInput, group, info, setFailed, debug } from '@actions/core';
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

  debug('Test debug');
  info('Test info');

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

    const baseBranch = context.payload?.repository?.default_branch as string;
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
      await exec('git', ['push', 'origin', `${baseBranch}:${pullBranch}`, '--force']);
    });

    await group(`Create Pull Request`, async () => {
      try {
        const headBranch = `${context.repo.owner}:${pullBranch}`;
        
        const pulls = getOctokit(githubToken).rest.pulls;
        const pullBase = { ...context.repo, base: baseBranch, head: headBranch };

        const response = await pulls.list({ ...pullBase, state: 'open' });
        const pullNumber = response.data?.[0]?.number;
        
        if (pullNumber) {
          const { data } = await pulls.update({ ...pullBase, ...pullInfo, pull_number: pullNumber });
          info(`Pull Request '#${data.number} ${pullInfo.title}' updated`);
        } else {
          const { data } = await pulls.create({ ...pullBase, ...pullInfo, draft: pullDraft });
          info(`Pull Request '#${data.number} ${pullInfo.title}' created`);
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

  type TableRow = { error: string; file: string; message: string; code: string; helpUrl: string; line: string };

  const items = report?.items || [];
  const tables: { fixed: TableRow[]; todos: TableRow[] } = { fixed: [], todos: [] };
  for (const item of items) {
    const target = item?.fixed ? tables.fixed : tables.todos;

    target.push({
      error: item?.errorCode,
      file: item?.analysisTarget?.slice(baseDir.length),
      message: item?.fixed ? item?.message : item?.hint,
      code: item?.nodeText?.trim(),
      helpUrl: item?.helpUrl,
      line: item?.nodeLocation?.line,
    });
  }

  const tsVersion = report?.summary?.tsVersion?.split('-')?.shift(); // Version without `beta` suffix
  const title = `chore(rehearsal): compatibility for upcoming TypeScript ${tsVersion}`;

  let body = ``;

  body += `### Summary:\n`;
  body += `Typescript Version: ${tsVersion}\n`;
  body += `Files updated: ${report?.summary?.files}\n`;

  body += `\n`;
  body += `### Fixed:\n`;
  body += `| Error | File | Code | Action | Message |\n`;
  body += `| - | - | - | - | - |\n`;
  for (const row of tables.fixed) {
    body += `| ${row.error} | ${row.file} | ${row.code} | ... | ${row.message} |\n`;
  }

  body += `\n`;
  body += `### To do:\n`;
  body += `| Error | File | Code | Issue | Message |\n`;
  body += `| - | - | - | - | - |\n`;

  for (const row of tables.todos) {
    const errorText = row.helpUrl ? `[${row.error}](${row.helpUrl})` : row.error;
    body += `| ${errorText} | ${row.file} | ${row.code} | ... | ${row.message} |\n`;
  }

  return { title, body };
}
