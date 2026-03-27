# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2026-03-27

### Added
- Self-correcting memory layer for OpenCode
- Learning modes: full (auto-learn), suggest (approval), off (read-only)
- Approval workflow for pending lessons
- Rollback support for learned lessons
- Version history tracking for all lessons
- Automatic constraint injection when confidence threshold met
- Context engineering via `experimental.chat.messages.transform` hook
- MCP server for OpenCode commands
- Comprehensive error sanitization (strips passwords, API keys, paths)
- Vector-based semantic search using ZVec
- Workspace isolation (learns per-project conventions)
- Organic confidence decay for stale lessons
- Tool sequence learning
- Workspace convention detection

### Features
- `/openlearn` - Main help command
- `/openlearn-list` - List all lessons (filter: all, pending, tool name)
- `/openlearn-review` - Interactively approve/reject pending lessons
- `/openlearn-approve` - Approve a specific lesson by ID
- `/openlearn-reject` - Reject a specific lesson by ID
- `/openlearn-history` - Show version history of a lesson
- `/openlearn-rollback` - Rollback to previous version
- `/openlearn-export` - Export all data as JSON
- `/openlearn-import` - Import from JSON backup
- `/openlearn-config` - Show/modify configuration
- `/openlearn-clear` - Clear lessons/pending/all

### Technical
- Robust error detection with 50+ patterns
- Confidence scoring for error severity
- MCP tool error detection (limited by OpenCode architecture)
- 114 test cases with bun:test framework

### Known Limitations
- MCP tool errors cannot be auto-learned due to OpenCode hook architecture
- See README.md for details
