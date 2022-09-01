import { getInput } from "@actions/core";

function run() {
  const srcDir = getInput("src_dir");
  console.log(srcDir)
}

run();
