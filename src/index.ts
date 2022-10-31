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
  const pullTitleTemplate = getInput('pull-request-title');
  const pullBodyTemplate = getInput('pull-request-body');

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
          await exec('npm', ['install', 'typescript', '-g']);
          await exec('npm', ['install', '@rehearsal/cli', '-g']);
        }
      }
    });

    const baseDir = resolve(basePath);

    await group('Run Rehearsal Upgrade', async () => {
      await exec('rehearsal', ['upgrade', baseDir, '--report', 'json,sarif', '--dryRun']);
    });

    const report = await readReport(baseDir);

    if (!report?.items?.length) {
      const tsVersion: string = getVersionWithoutBuild(report?.summary?.tsVersion || '');
      
      info(`Congrats! The code looks ready for TypeScript ${tsVersion}! No changes needed`);
      process.exit(0);
    }

    const pullInfo = await generatePullRequestTitleAndBody(report, pullTitleTemplate, pullBodyTemplate);

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

    const baseBranch = context.payload?.repository?.default_branch as string;

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
 * Reads a report object from the file
 */
async function readReport(baseDir: string): Promise<any> {
  return await import(resolve(baseDir, '.rehearsal', 'report.json'));
}

/**
 * Generates a Pull Request description based on the report provided by Rehearsal
 */
async function generatePullRequestTitleAndBody(
  report: any,
  pullTitleTemplate: string,
  pullBodyTemplate: string
): Promise<{ title: string; body: string }> {
  const basePath = report?.summary?.basePath || '';

  type TableRow = { error: string; file: string; message: string; code: string; helpUrl: string; line: string };

  const items = report?.items || [];
  const tables: { fixed: TableRow[]; todos: TableRow[] } = { fixed: [], todos: [] };
  for (const item of items) {
    const target = item?.fixed ? tables.fixed : tables.todos;

    target.push({
      error: item?.errorCode,
      file: item?.analysisTarget?.slice(basePath),
      message: item?.fixed ? item?.message : item?.hint,
      code: item?.nodeText?.trim(),
      helpUrl: item?.helpUrl,
      line: item?.nodeLocation?.line,
    });
  }

  const tsVersion: string = getVersionWithoutBuild(report?.summary?.tsVersion || '');

  let summary = ``;
  summary += `Typescript Version: ${tsVersion}\n`;
  summary += `Files updated: ${report?.summary?.files}\n`;

  let fixedItems = ``;
  fixedItems += `| Error | File | Code | Action | Message |\n`;
  fixedItems += `| - | - | - | - | - |\n`;
  for (const row of tables.fixed) {
    fixedItems += `| ${row.error} | ${row.file} | ${row.code} | ... | ${row.message} |\n`;
  }

  let todoItems = ``;
  todoItems += `| Error | File | Code | Issue | Message |\n`;
  todoItems += `| - | - | - | - | - |\n`;
  for (const row of tables.todos) {
    const errorText = row.helpUrl ? `[${row.error}](${row.helpUrl})` : row.error;
    todoItems += `| ${errorText} | ${row.file} | ${row.code} | ... | ${row.message} |\n`;
  }

  return {
    title: replaceAll(pullTitleTemplate, {
      '{tsVersion}': tsVersion,
    }),
    body: replaceAll(pullBodyTemplate, {
      '{summary}': summary,
      '{fixedItems}': fixedItems,
      '{todoItems}': todoItems,
    }),
  };
}

/**
 * Returns the numeric version without build (-beta, -rc, -dev, etc.)
 */
function getVersionWithoutBuild(versionWithBuilds: string): string {
  return versionWithBuilds.split('-')?.shift() || '';
}

/**
 * Replaces all object's keys with their values in the subject string
 */
function replaceAll(subject: string, replacements: { [key: string]: string }): string {
  return subject.replace(/{\w+}/g, (placeholder) =>
    placeholder in replacements ? replacements[placeholder] : placeholder
  );
}
