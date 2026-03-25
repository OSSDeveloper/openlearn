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
  ]
}
```

That's it. It just works.

---

## How It Works

**Before** a tool runs → openlearn checks relevant lessons and warns you:
```
[openlearn] Tool npm:
⚠️ Check network connectivity and endpoint availability
```

**After** a tool fails → openlearn analyzes the error, creates a lesson, stores it:
```
[openlearn] 📚 New lesson stored: "Check network connectivity"
```

**After** a tool succeeds → openlearn closes the loop. The error is resolved. The lesson matures.

**On recurring errors** (5+ occurrences without resolution):
```
[openlearn] ⚠️ UNRESOLVED ERROR (7x): "connection timeout"
[openlearn] Consider adding a lesson or fixing the root cause.
```

---

## Your Data Stays Yours

All data lives in `~/.openlearn/`:
- `lessons.json` — Error → constraint mappings
- `sequences.json` — Successful tool chains
- `conventions.json` — Your workspace patterns
- `unresolved.json` — Recurring errors needing attention
- `*.zvec` — Vector embeddings for semantic search

**Privacy first.** API keys, IPs, and file paths are sanitized before storage. Your secrets don't leave your machine.

---

## The Philosophy

Most tools optimize for *doing more*.

openlearn optimizes for *doing less repeated work*.

A 1% improvement in not repeating mistakes compounds. Over 1000 tool executions, that's 10 errors you didn't have to debug manually. That's hours reclaimed.

**The best error is the one you only see once.**

---

## Status

- Version 1.1.3
- Built for OpenCode
- Vector similarity via @zvec/zvec

MIT License. Use it. Break it. Improve it.
