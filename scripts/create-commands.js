import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";

const HOME_DIR = os.homedir();
const COMMANDS_DIR = path.join(HOME_DIR, ".config", "opencode", "commands");

const COMMANDS = {
  "openlearn.md": `---
description: OpenLearn - self-correcting memory layer for OpenCode
agent: build
---
Use openlearn MCP tools to manage lessons and learnings. Available tools:
- openlearn_list: List lessons (filter by "all", "--pending", or tool name)
- openlearn_review: Interactive review of pending lessons
- openlearn_approve <id>: Approve a pending lesson
- openlearn_reject <id>: Reject a pending lesson
- openlearn_history <id>: Show version history of a lesson
- openlearn_rollback <id>: Rollback a lesson to a previous version
- openlearn_export_data: Export all data as JSON
- openlearn_import_data <json>: Import data from JSON
- openlearn_get_config: Get current configuration
- openlearn_set_config <key> <value>: Set a configuration value
- openlearn_clear <target>: Clear data (lessons, pending, or all)
`,

  "openlearn-list.md": `---
description: List all openlearn lessons and learnings
agent: build
---
Run openlearn_list with filter "all" to show summary of all learnings.

Use these variations:
- openlearn_list with filter "pending" to show only pending reviews
- openlearn_list with a tool name to filter by tool (e.g., "npm", "git")
`,

  "openlearn-review.md": `---
description: Interactively review and approve/reject pending openlearn lessons
agent: build
---
Run openlearn_review to interactively review pending lessons one by one.
Approve with y, reject with n, skip with s, quit with q.
`,

  "openlearn-approve.md": `---
description: Approve a specific pending openlearn lesson
agent: build
---
Run openlearn_approve with the lesson ID as argument to approve and activate a pending lesson.
Example: openlearn_approve with lessonId "lesson_abc123"
`,

  "openlearn-reject.md": `---
description: Reject a specific pending openlearn lesson
agent: build
---
Run openlearn_reject with the lesson ID as argument to reject and delete a pending lesson.
Example: openlearn_reject with lessonId "lesson_abc123"
`,

  "openlearn-history.md": `---
description: Show version history of an openlearn lesson
agent: build
---
Run openlearn_history with a lesson ID to see all previous versions and changes.
Example: openlearn_history with lessonId "lesson_abc123"
`,

  "openlearn-rollback.md": `---
description: Rollback an openlearn lesson to a previous version
agent: build
---
Run openlearn_rollback with a lesson ID to interactively rollback to a previous version.
Example: openlearn_rollback with lessonId "lesson_abc123"
`,

  "openlearn-export.md": `---
description: Export all openlearn data as JSON
agent: build
---
Run openlearn_export_data to export all lessons, pending lessons, and config as JSON.
Copy the JSON output to use for backup.
`,

  "openlearn-import.md": `---
description: Import openlearn data from JSON
agent: build
---
Run openlearn_import_data with JSON data string to import lessons from a backup.
The JSON should be from a previous openlearn_export_data call.
`,

  "openlearn-config.md": `---
description: Show or modify openlearn configuration
agent: build
---
Run openlearn_get_config to see current settings.

Use openlearn_set_config to change settings:
- learningMode: "full", "suggest", or "off"
- autoInjectThreshold: 0.0 to 1.0
- confidenceDecay: "true" or "false"
- showSequences: "true" or "false"
- showConventions: "true" or "false"

Example: openlearn_set_config with key "learningMode" and value "suggest"
`,

  "openlearn-clear.md": `---
description: Clear openlearn data (lessons, pending, or everything)
agent: build
---
Run openlearn_clear with target:
- "lessons": Clear only active lessons, keep sequences
- "pending": Clear only pending lessons
- "all": Clear everything (lessons, pending, sequences, conventions, unresolved, history)

Use with caution - this cannot be undone.
`
};

async function ensureDir(dir) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

async function createCommands() {
  try {
    await ensureDir(COMMANDS_DIR);
    
    console.log(`Creating OpenLearn commands in ${COMMANDS_DIR}`);
    
    for (const [filename, content] of Object.entries(COMMANDS)) {
      const filepath = path.join(COMMANDS_DIR, filename);
      await writeFile(filepath, content, "utf-8");
      console.log(`  Created /${filename.replace(".md", "")}`);
    }
    
    console.log("\nOpenLearn commands installed successfully!");
    console.log(`You can now use /openlearn, /openlearn-list, /openlearn-review, etc.\n`);
  } catch (error) {
    console.error("Failed to create commands:", error.message);
    process.exit(1);
  }
}

createCommands();