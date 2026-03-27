# Contributing to openlearn

Thank you for your interest in contributing!

## Development Setup

1. Clone the repository
2. Install dependencies: `bun install`
3. Run tests: `bun test`
4. Build: `bun run build:all`

## Testing

We use [bun:test](https://bun.sh/docs/runtime/test) for testing.

```bash
bun test              # Run all tests
bun test --watch      # Watch mode for development
```

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Test changes
- `refactor:` Code refactoring

## Releasing

We use git tags for releases:

```bash
git tag v0.0.2
git push --tags
```

The GitHub Actions workflow will automatically:
1. Run tests
2. Build the project
3. Publish to npm (when tag starts with `v`)
4. Create a GitHub release

## Project Structure

```
src/
  plugin.ts    - Main OpenCode plugin hooks
  server.ts   - MCP server for OpenCode commands
  core.ts     - Shared data layer and utilities
  error-detector.ts - Error detection module

dist/
  plugin.js   - Compiled plugin
  server.js   - Compiled MCP server
```

## Code Style

- TypeScript with strict mode
- No comments unless absolutely necessary
- Follow existing patterns in the codebase

## Issues

Please report issues with:
- OpenCode version
- Error messages
- Steps to reproduce
- Expected vs actual behavior
