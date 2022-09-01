# Rehearsal GitHub Action

Runs Rehearsal Update to keep your TypeScript project ready for the latest TypeScript version. 

The action updates a project code where it's possible and creates tickets (issues) for issues that need engineer interaction.

Learn about [@rehearsal/migrate](https://github.com/rehearsal-js/rehearsal-js/tree/master/packages/migrate) if you want to migrate your project from JavaScript to TypeScript.

# Features

- Creates a Pull Request with code changes to make a project ready for the upcoming TypeScript version
- Opens Tickets (Issues) with suggested code changes have to be made by engineer
- Provides a report in [SARIF](https://github.com/microsoft/sarif-tutorials) format compatible with [Checkup](https://checkupjs.github.io/) and [SARIF Viewer for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=MS-SarifVSCode.sarif-viewer)  

# Usage

Create a `rehearsal.yml` file in `.github/workflows` directory to configure the action. 
See [action.yml](https://github.com/rehearsal-js/action/blob/master/action.yml) for available input parameters. 

The configuration could look like this:

```yaml
name: Rehearsal Upgrade

on:
  workflow_dispatch:
  schedule:
    - cron: '0 8 * * 1'

jobs:
  rehearse:
    name: Run Upgrade
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: rehearsal-js/action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

# License

The scripts and documentation in this project has released under the [BSD-2-Clause](https://github.com/rehearsal-js/action/blob/master/LICENSE.md)
