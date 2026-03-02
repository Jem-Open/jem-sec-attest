# Contributing to jem-sec-attest

Thank you for your interest in contributing to jem-sec-attest! Every contribution -- whether it is a bug report, feature suggestion, documentation improvement, or code change -- helps make this project better. We appreciate your time and effort.

## Getting Started

### Fork and Clone

1. Fork this repository on GitHub.
2. Clone your fork locally:

   ```bash
   git clone https://github.com/<your-username>/jem-sec-attest.git
   cd jem-sec-attest
   ```

3. Add the upstream remote:

   ```bash
   git remote add upstream https://github.com/Jem-Open/jem-sec-attest.git
   ```

### Local Setup

1. Install dependencies (this project uses **pnpm**):

   ```bash
   pnpm install
   ```

2. Copy the environment file and fill in the required values:

   ```bash
   cp .env.example .env
   ```

   At a minimum you will need:
   - `SESSION_SECRET` -- at least 32 characters
   - An AI provider key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `AZURE_OPENAI_API_KEY`)

3. Start the development server:

   ```bash
   pnpm dev
   ```

## Development Workflow

### Branch Naming

Create a feature branch from `main`:

```bash
git checkout -b <type>/<short-description>
```

Common prefixes: `feat/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/`.

### Useful Commands

| Command              | Purpose                                  |
| -------------------- | ---------------------------------------- |
| `pnpm dev`           | Start the Next.js development server     |
| `pnpm test`          | Run all tests (unit + integration + contract) |
| `pnpm test:unit`     | Run unit tests only                      |
| `pnpm test:integration` | Run integration tests only            |
| `pnpm test:coverage` | Run tests with coverage (80% threshold)  |
| `pnpm lint`          | Run Biome linter                         |
| `pnpm lint:fix`      | Auto-fix lint issues                     |
| `pnpm type-check`    | Run `tsc --noEmit`                       |
| `pnpm build`         | Production build                         |

### Pre-commit Hooks

Pre-commit hooks are managed by **lefthook** and run automatically on every commit. They execute `lint` and `type-check` so issues are caught early. You do not need to install anything extra -- hooks are configured when you run `pnpm install`.

## Code Style

This project uses [Biome](https://biomejs.dev/) for linting and formatting. The configuration enforces:

- **2-space indentation**
- **Double quotes** for strings
- **Semicolons** required
- **100-character line width**
- Import sorting and no unused variables/imports

Run `pnpm lint:fix` before committing to auto-fix formatting issues. If you create a new file manually, you can also run:

```bash
npx biome check --write <file>
```

### Import Conventions

- Use the **`@/*` path alias** for all imports from `src/`. For example: `import { something } from "@/config/index"`.
- Do **not** include file extensions in imports -- `moduleResolution: "bundler"` handles resolution.

### License Headers

All new source files must include an **Apache 2.0 license header** at the top. See existing files for the exact format.

## Submitting a Pull Request

1. Make sure all tests pass: `pnpm test`
2. Make sure the linter is clean: `pnpm lint`
3. Make sure types check: `pnpm type-check`
4. Push your branch and open a pull request against `main`.
5. Fill out the pull request template.

### Code Review

- All pull requests require **at least one approving review** before merging.
- CI must pass: tests, linting, and type checking.
- No new lint warnings are allowed.
- Keep pull requests focused -- one logical change per PR when possible.

## Reporting Issues

Use [GitHub Issues](https://github.com/Jem-Open/jem-sec-attest/issues) to report bugs or request features. Please use the provided issue templates.

## Questions?

If you have questions that are not covered here, start a conversation in [GitHub Discussions](https://github.com/Jem-Open/jem-sec-attest/discussions).

Thank you for contributing!
