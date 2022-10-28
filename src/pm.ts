import { getExecOutput as exec } from '@actions/exec';
import { create as createGlobber } from '@actions/glob';

export type PackageManager = 'npm' | 'pnpm' | 'yarn';

/**
 * Detects which package manager is used in the projects.
 * Made a decision on available lock files and binaries in the order yarn -> pnpm -> npm
 */
export async function detectPackageManager(): Promise<PackageManager> {
  const checkLockFile = async (binFileName: PackageManager, lockFileName: string): Promise<PackageManager | null> => {
    return createGlobber(`${lockFileName}`)
      .then((g) => g.glob())
      .then((f) => (f.length ? binFileName : null));
  };

  const checkBinaryFile = async (binFileName: PackageManager): Promise<PackageManager | null> => {
    return exec(binFileName, ['--version'], { silent: true })
      .then(() => binFileName)
      .catch(() => null);
  };

  return await Promise.all([
    checkLockFile('yarn', 'yarn.lock'),
    checkLockFile('pnpm', 'pnpm-lock.yaml'),
    checkLockFile('npm', 'package-lock.json'),
    checkBinaryFile('yarn'),
    checkBinaryFile('pnpm'),
  ]).then(([yarnLock, pnpmLock, npmLock, yarnBin, pnpmBin]) => {
    return yarnLock || pnpmLock || npmLock || yarnBin || pnpmBin || 'npm';
  });
}
