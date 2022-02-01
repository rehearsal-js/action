# GitHub Action to Setup Rehearsal

This action runs the [@rehearsal/cli](https://github.com/rehearsal-js/rehearsal-js) with typescript argument.

# Usage

See [action.yml](https://github.com/rehearsal-js/action/blob/master/action.yml)

Basic: When the project's `package.json` has a `rehearsal-js` property with `node` and/or `yarn` versions pinned, with default rehearsal flags:

```yaml
steps:
  - uses: actions/checkout@v2
  - uses: rehearsal-js/action@v1
  - run: yarn install
  - run: yarn test
```

Advanced: Manually specifying rehearsal flags:

```yaml
steps:
  - uses: actions/checkout@v2
  - uses: rehearsal-cli/action@v1
    with:
      autofix: true
      build: "next"
      dry_run: true
      src_dir: "./src"
      tsc_version: 4.2.4

  - run: yarn install
  - run: yarn test
```

# License

The scripts and documentation in this project are released under the [BSD-2-Clause](https://github.com/rehearsal-js/action/blob/master/LICENSE)
