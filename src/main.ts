import { getInput, setFailed } from '@actions/core';
import { TS } from '@rehearsal/cli';

// inputs available from action.yml
const INPUTS = ['autofix', 'build', 'dry_run', 'src_dir', 'tsc_version'];

async function run(): Promise<void> {
  try {
    const inputValues = getInputValues();
    await TS.run(inputValues);
  } catch (error) {
    if (error instanceof Error) {
      setFailed(error.message);
    }
  }
}

function getInputValues(): string[] {
  const flags: string[] = [];

  INPUTS.forEach((input) => {
    // get the yml input value
    const inputValue = getInput(input, { required: false });
    if (inputValue) {
      flags.push(`--${input}`, inputValue);
    }
  });

  return flags;
}

run();
