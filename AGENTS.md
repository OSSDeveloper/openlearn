# Agent Instructions for openlearn Project

## CRITICAL RULE: Ground ALL Development in Actual OpenCode Source Code

**This rule is NON-NEGOTIABLE and MANDATORY for all tasks.**

Before writing code, planning features, or making changes to this openlearn project, you **MUST**:

1. **Read the actual OpenCode source code** at `/Users/ossdeveloper/Desktop/opencode/opencode/` - The OpenCode source is the **authoritative reference** for how the plugin system works
2. **Consult OpenCode's Hooks interface** - Read `packages/opencode/src/plugin/index.ts` to understand exactly how hooks are called
3. **Read the `@opencode-ai/plugin` type definitions** - Not just trust the interface, but understand the actual runtime behavior
4. **NEVER assume** - Documentation (including this project's docs) can be wrong or incomplete. Source code does not lie.

**For every change, you MUST verify against OpenCode source:**
- How does OpenCode call hooks? (see `packages/opencode/src/plugin/index.ts:175-180`)
- What is the exact hook signature? (see `packages/plugin/src/index.ts:164-250`)
- How does OpenCode process tool executions? (see `packages/opencode/src/session/prompt.ts`)

## Why This Matters

This project has been burnt before:
- Plugin hooks were implemented using camelCase nested objects (`hooks: { toolExecuteAfterHook }`) but OpenCode expects flat kebab-case keys (`"tool.execute.after"`) - the guide didn't mention this, source code did
- The OpenCode Technical Guide didn't mention MCP tools → assumption they work the same as native tools → they don't
- Type definitions exist at `node_modules/@opencode-ai/plugin/dist/index.d.ts` but were not consulted
- Hook signatures in openlearn didn't match what OpenCode actually passes (missing `sessionID`, `callID`, wrong output structure)

## TDD: Test-Driven Development is MANDATORY

**This is an INVARIANT for this project. Violating it will result in broken functionality.**

Before writing ANY code or making ANY changes:
1. **Write failing tests FIRST** - Tests must define expected behavior
2. **Run tests to verify they fail** - Confirm the test catches the missing/broken functionality
3. **Write the implementation** - Make the tests pass
4. **Run tests to verify they pass** - Confirm the implementation works
5. **Refactor if needed** - Tests must still pass after refactoring

### Why TDD?
- We caught a bug where MCP tool results weren't being parsed correctly (output has `content` array, not `output.output`)
- We caught missing error detection for various error types
- We caught learning mode configuration issues
- Tests prevent regressions when adding new features

### Running Tests
```bash
npm test          # Run all tests
npm test --watch  # Watch mode for development
```

### Test Structure
- `src/core.test.ts` - Core utility functions (sanitizeError, extractWorkspace, etc.)
- `src/plugin.test.ts` - Plugin hooks and integration tests
- Tests use `bun:test` framework
- Tests must be independent and can run in any order

## How to Apply This Rule

Before writing code or making changes:
1. Read the relevant source files in `src/`
2. Check type definitions in `node_modules/` for actual interfaces
3. Verify the installed plugin code matches what you expect
4. For OpenCode plugin development: read the actual Hooks interface in `index.d.ts`

## Quick Reference for This Project

- **Source code**: `src/plugin.ts`, `src/core.ts`, `src/server.ts`
- **Tests**: `src/*.test.ts` - Run with `npm test`
- **OpenCode plugin interface**: `node_modules/@opencode-ai/plugin/dist/index.d.ts`
- **Installed plugin path**: `/opt/homebrew/lib/node_modules/@ossdeveloper/openlearn/dist/`
- **OpenCode source (MUST BE CONSULTED)**: `/Users/ossdeveloper/Desktop/opencode/opencode/`
  - **Hooks implementation**: `packages/opencode/src/plugin/index.ts` - shows how hooks are called
  - **Tool execution**: `packages/opencode/src/session/prompt.ts` - shows when `tool.execute.after` is triggered
  - **Plugin types**: `packages/plugin/src/index.ts` - Hooks interface definition

## Reminder

**STOP** - Before writing ANY code or planning ANY feature, you MUST have read the relevant OpenCode source files. Documentation can be wrong or incomplete. Source code does not lie.
