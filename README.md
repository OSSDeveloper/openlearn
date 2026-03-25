# openlearn

Self-correcting learning plugin for OpenCode - learns from tool failures and successes using vector similarity.

## Installation

```bash
npm install -g @ossdeveloper/openlearn
```

Add to OpenCode config (`~/.config/opencode/opencode.json`):
```json
{
  "plugin": [
    "@ossdeveloper/openlearn"
  ]
}
```

## What It Does

- **Error Patterns**: Maps tool failures to actionable constraints
- **Tool Sequences**: Tracks successful chains (e.g., `git-add → git-commit → git-push`)
- **Workspace Conventions**: Learns your preferences (commit format, git add patterns)
- **Unresolved Tracking**: Alerts you when errors keep happening without resolution

## Data Storage

All learned data stored in `~/.openlearn/`:
- `lessons.json` - Error → constraint mappings
- `lessons.zvec` - Vector embeddings
- `sequences.json` - Tool execution chains
- `conventions.json` - Workspace patterns
- `unresolved.json` - Errors needing attention

**Privacy**: API keys, IPs, and file paths are sanitized before storage.

## License

MIT License