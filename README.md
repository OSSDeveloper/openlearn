# openlearn

**Make your coding agent learn from its mistakes.**

openlearn is a self-correcting memory layer for OpenCode. It watches what fails, figures out *why*, and whispers the fix before you hit retry.

No more repeating the same error 47 times. No more "permission denied" hitting you twice. openlearn builds a model of your workspace's quirks—and gets smarter every session.

---

## Why This Exists

Every great agent needs memory.

OpenCode is powerful. But it forgets. The same SSH key permissions error. The same Docker cache issue. The same rsync --delete disaster.

**openlearn fixes that.**

It watches failures, extracts patterns, and feeds context back before you waste another minute on the same mistake.

---

## Learning Modes

openlearn has three learning modes to control how it operates:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `full` | Learn automatically + auto-inject | Personal use, fast iteration |
| `suggest` | Learn but require approval | Team/production safety |
| `off` | Don't learn anything new | Read-only mode |

Set via: `openlearn: config set learningMode suggest`

---

## Commands

All commands use the `openlearn:` prefix in chat.

### Viewing Learnings
```
openlearn: help                    # Show all commands
openlearn: list                    # Summary of learnings
openlearn: list --all              # Full paginated list
openlearn: list --pending          # Only pending review
openlearn: list <tool>            # Filter by tool (npm, git, etc)
```

### Review & Approval
```
openlearn: review                  # Interactive pending review
openlearn: approve <id>           # Approve specific lesson
openlearn: reject <id>            # Reject specific lesson
```

### History & Rollback
```
openlearn: history <id>           # Show version history of a lesson
openlearn: rollback <id>          # Interactively rollback a lesson
```

### Backup & Restore
```
openlearn: export                 # Print JSON to copy
openlearn: import <json>          # Import from pasted JSON
```

### Configuration
```
openlearn: config                 # Show current config
openlearn: config --list          # List all config options
openlearn: config set <key> <val> # Set a config value
```

### Safety
```
openlearn: clear                  # Clear ALL learnings (confirm prompt)
openlearn: clear --lessons        # Clear only lessons, keep sequences
openlearn: clear --pending        # Clear only pending
```

---

## What It Learns

### Error Patterns → Actionable Constraints
```
"permission denied"  →  "Use sudo or check file permissions"
"no such file"       →  "Verify file path exists before operation"
"connection timeout" →  "Check network connectivity and endpoint"
```

Not vague error messages. **Directives.** Things you can actually act on.

### Tool Sequences
Detects chains that work:
```
git-add → git-commit → git-push  (89% success rate)
```

So when you start `git add .`, openlearn knows what's coming—and prepares accordingly.

### Workspace Conventions
Learns *your* patterns:
- Commit message formats you actually use
- Whether you prefer `git add .` or selective staging
- Project-specific quirks

---

## Installation

```bash
npm install -g @ossdeveloper/openlearn
```

Add to your OpenCode config (`~/.config/opencode/opencode.json`):

```json
{
  "plugins": [
    "@ossdeveloper/openlearn"
  ],
  "mcp": {
    "openlearn": {
      "type": "local",
      "command": ["openlearn-mcp"]
    }
  }
}
```

That's it. It just works.

---

## How It Works

**Before** a tool runs → openlearn checks relevant lessons and injects them as context:
```
[LEARNED CONSTRAINTS]
Lesson 1: Check network connectivity and endpoint availability
```

**After** a tool fails → openlearn analyzes the error, creates a lesson:
```
Mode full:  Lesson stored: "Check network connectivity"
Mode suggest: New lesson pending review. Run `openlearn: review` to approve.
```

**After** a tool succeeds → openlearn reinforces the lesson, confidence increases.

**On recurring errors** (5+ occurrences without resolution):
```
⚠️ UNRESOLVED ERROR (7x): "connection timeout"
Run `openlearn: list --pending` to review
```

---

## Your Data Stays Yours

All data lives in `~/.openlearn/`:
- `lessons.json` — Active error → constraint mappings
- `pending.json` — Lessons awaiting approval
- `history.json` — Version history for rollback
- `audit.json` — Full audit trail
- `config.json` — Your settings
- `sequences.json` — Successful tool chains
- `conventions.json` — Your workspace patterns
- `unresolved.json` — Recurring errors needing attention
- `*.zvec` — Vector embeddings for semantic search

**Privacy first.** API keys, IPs, and file paths are sanitized before storage. Your secrets don't leave your machine.

---

## Config Options

| Key | Values | Default | Description |
|-----|--------|---------|-------------|
| `learningMode` | `full`, `suggest`, `off` | `full` | How lessons are learned |
| `autoInjectThreshold` | `0.0` - `1.0` | `0.7` | Min confidence to auto-inject |
| `confidenceDecay` | `true`, `false` | `true` | Lessons lose confidence over time |
| `showSequences` | `true`, `false` | `true` | Detect and show tool sequences |
| `showConventions` | `true`, `false` | `true` | Learn workspace conventions |

---

## The Philosophy

Most tools optimize for *doing more*.

openlearn optimizes for *doing less repeated work*.

A 1% improvement in not repeating mistakes compounds. Over 1000 tool executions, that's 10 errors you didn't have to debug manually. That's hours reclaimed.

**The best error is the one you only see once.**

---

## Status

- Version 2.0.2
- Built for OpenCode
- Vector similarity via @zvec/zvec
- MCP server for direct tool access

**New in v2.0:** Learning modes, approval workflow, rollback, audit log, MCP server, and OpenCode slash commands auto-installed.

MIT License. Use it. Break it. Improve it.