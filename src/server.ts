import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  DATA_DIR,
  DB_PATH,
  PENDING_PATH,
  CONFIG_PATH,
  AUDIT_PATH,
  HISTORY_PATH,
  ZVEC_PATH,
  SEQ_ZVEC_PATH,
  CONV_ZVEC_PATH,
  UNRESOLVED_PATH,
  type Lesson,
  type PendingLesson,
  type Config,
  type AuditEntry,
  type LessonHistory,
  type ToolSequence,
  type WorkspaceConvention,
  type UnresolvedError,
  type ChatResponse,
  DEFAULT_CONFIG,
  ensureDataDir,
  loadConfig,
  saveConfig,
  loadAllLessons,
  loadLessons,
  saveLessons,
  loadPending,
  savePending,
  loadSequences,
  saveSequences,
  loadConventions,
  saveConventions,
  loadUnresolved,
  saveUnresolved,
  loadAudit,
  saveAudit,
  addAuditEntry,
  loadHistory,
  saveHistory,
  addHistoryEntry,
  generateLessonId,
  sanitizeError,
  textToEmbedding
} from "./core.js";

const UNRESOLVED_THRESHOLD = 5;

interface UnresolvedError {
  id: string;
  tool: string;
  workspacePattern: string;
  errorEmbedding: number[];
  errorText: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
}

const server = new Server(
  {
    name: "openlearn-mcp",
    version: "2.0.2",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const tools: Tool[] = [
  {
    name: "openlearn_list",
    description: "List openlearn lessons and learnings. Use filter 'all' for summary, 'pending' for pending reviews, or a tool name to filter.",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description: "Filter: 'all', 'pending', or tool name (e.g., 'npm', 'git')"
        }
      }
    }
  },
  {
    name: "openlearn_review",
    description: "Interactively review pending lessons",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "openlearn_approve",
    description: "Approve a pending lesson by ID",
    inputSchema: {
      type: "object",
      properties: {
        lessonId: {
          type: "string",
          description: "The lesson ID to approve"
        }
      },
      required: ["lessonId"]
    }
  },
  {
    name: "openlearn_reject",
    description: "Reject a pending lesson by ID",
    inputSchema: {
      type: "object",
      properties: {
        lessonId: {
          type: "string",
          description: "The lesson ID to reject"
        }
      },
      required: ["lessonId"]
    }
  },
  {
    name: "openlearn_history",
    description: "Show version history of a lesson",
    inputSchema: {
      type: "object",
      properties: {
        lessonId: {
          type: "string",
          description: "The lesson ID"
        }
      },
      required: ["lessonId"]
    }
  },
  {
    name: "openlearn_rollback",
    description: "Rollback a lesson to a previous version",
    inputSchema: {
      type: "object",
      properties: {
        lessonId: {
          type: "string",
          description: "The lesson ID to rollback"
        }
      },
      required: ["lessonId"]
    }
  },
  {
    name: "openlearn_export_data",
    description: "Export all openlearn data as JSON",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "openlearn_import_data",
    description: "Import data from JSON",
    inputSchema: {
      type: "object",
      properties: {
        json: {
          type: "string",
          description: "JSON data from export"
        }
      },
      required: ["json"]
    }
  },
  {
    name: "openlearn_get_config",
    description: "Get current openlearn configuration",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "openlearn_set_config",
    description: "Set a configuration value",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "Config key: learningMode, autoInjectThreshold, confidenceDecay, showSequences, showConventions"
        },
        value: {
          type: "string",
          description: "Value to set"
        }
      },
      required: ["key", "value"]
    }
  },
  {
    name: "openlearn_clear",
    description: "Clear openlearn data",
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          enum: ["lessons", "pending", "all"],
          description: "What to clear: 'lessons', 'pending', or 'all'"
        }
      },
      required: ["target"]
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "openlearn_list": {
        const filter = (args as { filter?: string })?.filter || "all";
        const allLessons = loadAllLessons();
        const pending = loadPending();
        const lessons = allLessons.filter(l => l.status === "active");
        const sequences = loadSequences();
        const conventions = loadConventions();
        const config = loadConfig();

        if (filter === "pending") {
          if (pending.length === 0) {
            return { content: [{ type: "text", text: "✅ No pending lessons. You're all caught up!" }] };
          }
          let output = `**📋 Pending Review** (${pending.length} lesson${pending.length > 1 ? "s" : ""})\n\n`;
          pending.forEach((p, i) => {
            const conf = p.confidence >= 0.7 ? "🟢" : p.confidence >= 0.4 ? "🟡" : "🔴";
            output += `[${i + 1}] ${conf} ${p.tool} • "${p.errorSemantic.substring(0, 50)}..." → "${p.constraint}"\n`;
            output += `   Confidence: ${(p.confidence * 100).toFixed(0)}% • ${p.triggerCount} triggers\n`;
            output += `   Workspace: ${p.workspacePattern}\n\n`;
          });
          return { content: [{ type: "text", text: output }] };
        }

        if (filter !== "all") {
          const filtered = lessons.filter(l => l.tool.toLowerCase().includes(filter.toLowerCase()));
          if (filtered.length === 0) {
            return { content: [{ type: "text", text: `No lessons found for tool "${filter}".` }] };
          }
          let output = `**📚 Lessons for "${filter}"** (${filtered.length} total)\n\n`;
          filtered.forEach((l, i) => {
            const conf = l.confidence >= 0.7 ? "🟢" : l.confidence >= 0.4 ? "🟡" : "🔴";
            output += `[${i + 1}] ${conf} "${l.errorSemantic.substring(0, 50)}..." → "${l.constraint}"\n`;
          });
          return { content: [{ type: "text", text: output }] };
        }

        const high = lessons.filter(l => l.confidence >= 0.7).length;
        const medium = lessons.filter(l => l.confidence >= 0.4 && l.confidence < 0.7).length;
        const low = lessons.filter(l => l.confidence < 0.4).length;

        const modeIcon = config.learningMode === "full" ? "📖" : config.learningMode === "suggest" ? "⏳" : "🚫";

        let output = `**📚 openlearn Status**\n`;
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        output += `Mode: ${modeIcon} ${config.learningMode}\n`;
        output += `Auto-inject threshold: ${(config.autoInjectThreshold * 100).toFixed(0)}%\n`;
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        output += `Lessons: ${lessons.length}\n`;
        output += `  🟢 High: ${high} | 🟡 Medium: ${medium} | 🔴 Low: ${low}\n`;
        output += `⏳ Pending: ${pending.length}\n`;
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        output += `Sequences: ${sequences.length} | Conventions: ${conventions.length}\n`;

        return { content: [{ type: "text", text: output }] };
      }

      case "openlearn_review": {
        const pending = loadPending();
        if (pending.length === 0) {
          return { content: [{ type: "text", text: "✅ No pending lessons to review. You're all caught up!" }] };
        }
        const first = pending[0];
        let output = `**📋 Pending Review** (${pending.length} total)\n\n`;
        output += `**Lesson:** ${first.id}\n`;
        output += `**Tool:** ${first.tool}\n`;
        output += `**Error:** "${first.errorSemantic.substring(0, 100)}..."\n`;
        output += `**Constraint:** "${first.constraint}"\n`;
        output += `**Confidence:** ${(first.confidence * 100).toFixed(0)}%\n\n`;
        output += `Use openlearn_approve or openlearn_reject with the lesson ID.`;
        return { content: [{ type: "text", text: output }] };
      }

      case "openlearn_approve": {
        const { lessonId } = args as { lessonId: string };
        const pending = loadPending();
        const idx = pending.findIndex(p => p.id === lessonId || p.id.includes(lessonId));
        if (idx === -1) {
          return { content: [{ type: "text", text: `Pending lesson "${lessonId}" not found.` }] };
        }
        const toApprove = pending[idx];
        const allLessons = loadAllLessons();
        const lesson: Lesson = {
          ...toApprove,
          status: "active",
          lastRetrieved: new Date().toISOString(),
          lastAccessed: new Date().toISOString()
        };
        allLessons.push(lesson);
        saveLessons(allLessons);
        pending.splice(idx, 1);
        savePending(pending);
        addHistoryEntry(lesson.id, {
          constraint: lesson.constraint,
          confidence: lesson.confidence,
          changedAt: new Date().toISOString(),
          action: "approved"
        });
        addAuditEntry("approved", lesson.id, `Approved pending lesson`);
        return { content: [{ type: "text", text: `✅ Lesson approved and activated!` }] };
      }

      case "openlearn_reject": {
        const { lessonId } = args as { lessonId: string };
        const pending = loadPending();
        const idx = pending.findIndex(p => p.id === lessonId || p.id.includes(lessonId));
        if (idx === -1) {
          return { content: [{ type: "text", text: `Pending lesson "${lessonId}" not found.` }] };
        }
        const rejected = pending.splice(idx, 1)[0];
        savePending(pending);
        addAuditEntry("rejected", rejected.id, `Rejected pending lesson`);
        return { content: [{ type: "text", text: `❌ Lesson rejected and deleted.` }] };
      }

      case "openlearn_history": {
        const { lessonId } = args as { lessonId: string };
        const allLessons = loadAllLessons();
        const lesson = allLessons.find(l => l.id === lessonId || l.id.includes(lessonId));
        if (!lesson) {
          return { content: [{ type: "text", text: `Lesson "${lessonId}" not found.` }] };
        }
        const history = loadHistory();
        const entries = history[lesson.id] || [];
        if (entries.length === 0) {
          return { content: [{ type: "text", text: `No history available for lesson "${lessonId}".` }] };
        }
        let output = `**📜 History for ${lesson.id}**\n\n`;
        entries.forEach(e => {
          const actionIcon = e.action === "rolled_back" ? "↩️" : e.action === "approved" ? "✅" : "📝";
          output += `${actionIcon} v${e.version}: ${e.constraint}\n`;
          output += `   Confidence: ${(e.confidence * 100).toFixed(0)}% | ${e.changedAt}\n\n`;
        });
        return { content: [{ type: "text", text: output }] };
      }

      case "openlearn_rollback": {
        const { lessonId } = args as { lessonId: string };
        const allLessons = loadAllLessons();
        const lesson = allLessons.find(l => l.id === lessonId || l.id.includes(lessonId));
        if (!lesson) {
          return { content: [{ type: "text", text: `Lesson "${lessonId}" not found.` }] };
        }
        const history = loadHistory();
        const entries = history[lesson.id] || [];
        if (entries.length <= 1) {
          return { content: [{ type: "text", text: `No previous version to rollback to.` }] };
        }
        const previous = entries[entries.length - 2];
        lesson.constraint = previous.constraint;
        lesson.confidence = previous.confidence;
        lesson.lastAccessed = new Date().toISOString();
        saveLessons(allLessons);
        addHistoryEntry(lesson.id, {
          constraint: lesson.constraint,
          confidence: lesson.confidence,
          changedAt: new Date().toISOString(),
          action: "rolled_back"
        });
        addAuditEntry("rolled_back", lesson.id, `Rolled back to v${previous.version}`);
        return { content: [{ type: "text", text: `↩️ Rolled back to v${previous.version}. New constraint: "${lesson.constraint}"` }] };
      }

      case "openlearn_export_data": {
        const lessons = loadAllLessons().filter(l => l.status === "active");
        const pending = loadPending();
        const config = loadConfig();
        const exportData = { lessons, pending, config, exportedAt: new Date().toISOString() };
        return { content: [{ type: "text", text: JSON.stringify(exportData, null, 2) }] };
      }

      case "openlearn_import_data": {
        const { json } = args as { json: string };
        try {
          const data = JSON.parse(json);
          if (data.lessons && Array.isArray(data.lessons)) {
            const allLessons = loadAllLessons();
            data.lessons.forEach((l: Lesson) => {
              l.status = "active";
              const existing = allLessons.findIndex(ex => ex.id === l.id);
              if (existing >= 0) {
                allLessons[existing] = l;
              } else {
                allLessons.push(l);
              }
              addHistoryEntry(l.id, {
                constraint: l.constraint,
                confidence: l.confidence,
                changedAt: new Date().toISOString(),
                action: "imported"
              });
            });
            saveLessons(allLessons);
          }
          if (data.pending && Array.isArray(data.pending)) {
            savePending(data.pending);
          }
          addAuditEntry("imported", undefined, "Imported lessons from backup");
          return { content: [{ type: "text", text: "✅ Import successful!" }] };
        } catch {
          return { content: [{ type: "text", text: "Invalid JSON format." }] };
        }
      }

      case "openlearn_get_config": {
        const config = loadConfig();
        let output = `**⚙️ Current Config**\n\n`;
        output += `\`learningMode\`: ${config.learningMode}\n`;
        output += `\`autoInjectThreshold\`: ${(config.autoInjectThreshold * 100).toFixed(0)}%\n`;
        output += `\`confidenceDecay\`: ${config.confidenceDecay}\n`;
        output += `\`showSequences\`: ${config.showSequences}\n`;
        output += `\`showConventions\`: ${config.showConventions}\n`;
        return { content: [{ type: "text", text: output }] };
      }

      case "openlearn_set_config": {
        const { key, value } = args as { key: string; value: string };
        const config = loadConfig();
        if (key === "learningMode") {
          if (!["full", "suggest", "off"].includes(value)) {
            return { content: [{ type: "text", text: "learningMode must be: full, suggest, or off" }] };
          }
          config.learningMode = value as any;
        } else if (key === "autoInjectThreshold") {
          const num = parseFloat(value);
          if (isNaN(num) || num < 0 || num > 1) {
            return { content: [{ type: "text", text: "autoInjectThreshold must be between 0 and 1" }] };
          }
          config.autoInjectThreshold = num;
        } else if (key === "confidenceDecay") {
          config.confidenceDecay = value === "true";
        } else if (key === "showSequences") {
          config.showSequences = value === "true";
        } else if (key === "showConventions") {
          config.showConventions = value === "true";
        } else {
          return { content: [{ type: "text", text: `Unknown config key "${key}".` }] };
        }
        saveConfig(config);
        return { content: [{ type: "text", text: `✅ Config updated: ${key} = ${value}` }] };
      }

      case "openlearn_clear": {
        const { target } = args as { target: string };
        if (target === "lessons") {
          const allLessons = loadAllLessons().filter(l => l.status === "pending");
          saveLessons(allLessons);
          addAuditEntry("cleared", undefined, "Cleared all active lessons");
          return { content: [{ type: "text", text: "🗑️ All active lessons cleared." }] };
        }
        if (target === "pending") {
          savePending([]);
          addAuditEntry("cleared", undefined, "Cleared all pending lessons");
          return { content: [{ type: "text", text: "🗑️ All pending lessons cleared." }] };
        }
        saveLessons([]);
        savePending([]);
        saveSequences([]);
        saveConventions([]);
        saveUnresolved([]);
        saveHistory({});
        saveAudit([]);
        try {
          if (fs.existsSync(ZVEC_PATH)) fs.rmSync(ZVEC_PATH);
          if (fs.existsSync(SEQ_ZVEC_PATH)) fs.rmSync(SEQ_ZVEC_PATH);
          if (fs.existsSync(CONV_ZVEC_PATH)) fs.rmSync(CONV_ZVEC_PATH);
        } catch { }
        addAuditEntry("cleared", undefined, "Cleared all data");
        return { content: [{ type: "text", text: "🗑️ All learnings cleared." }] };
      }

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    }
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error}` }] };
  }
});

import fs from "fs";

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();