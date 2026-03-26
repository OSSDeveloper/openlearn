import type { Plugin } from "@opencode-ai/plugin";
import { ZVecDoc } from "@zvec/zvec";
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
  AUTO_INJECT_THRESHOLD,
  type LearningMode,
  type Lesson,
  type Config,
  type AuditEntry,
  type AuditAction,
  type LessonHistory,
  type LessonHistoryEntry,
  type ToolSequence,
  type WorkspaceConvention,
  type PendingLesson,
  type ChatResponse,
  DEFAULT_CONFIG,
  initLessonsZvec,
  initSequencesZvec,
  initConventionsZvec,
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
  generateSequenceId,
  generateConventionId,
  sanitizeError,
  extractWorkspace,
  textToEmbedding
} from "./core.js";

const SEQ_WINDOW = 5;
const UNRESOLVED_THRESHOLD = 5;
const LEARN_THRESHOLD = 0.3;

interface SequenceStep {
  tool: string;
  args: Record<string, unknown>;
  success: boolean;
  timestamp: number;
}

interface FailureEvent {
  tool: string;
  args: Record<string, unknown>;
  error: string;
  workspace: string;
  timestamp: string;
}

let lessonsCollection: ReturnType<typeof initLessonsZvec> | null = null;
let sequencesCollection: ReturnType<typeof initSequencesZvec> | null = null;
let conventionsCollection: ReturnType<typeof initConventionsZvec> | null = null;

function initZVecCollections() {
  lessonsCollection = initLessonsZvec();
  sequencesCollection = initSequencesZvec();
  conventionsCollection = initConventionsZvec();
}

function generateConstraintFromEmbedding(errorEmbedding: number[]): { constraint: string; successIndicator: string } {
  const coll = lessonsCollection;
  if (!coll) {
    return { constraint: "Analyze error message and adjust approach", successIndicator: "operation completed successfully" };
  }

  try {
    const results = coll.querySync({ fieldName: "embedding", vector: errorEmbedding, topk: 1 });
    if (results && results.length > 0) {
      const lessons = loadLessons();
      const matchedLesson = lessons.find(l => l.id === results[0].id.replace("doc_", ""));
      if (matchedLesson && matchedLesson.constraint !== "Analyze error message and adjust approach") {
        return { constraint: matchedLesson.constraint, successIndicator: matchedLesson.successIndicator || "operation completed successfully" };
      }
    }
  } catch {
  }

  return { constraint: "Analyze error message and adjust approach", successIndicator: "operation completed successfully" };
}

function isFailure(output: unknown): boolean {
  if (typeof output !== "object" || output === null) return false;
  const o = output as Record<string, unknown>;

  if (typeof o.output === "string") {
    const lower = o.output.toLowerCase();
    return lower.includes("error") ||
           lower.includes("failed") ||
           lower.includes("denied") ||
           lower.includes("no such");
  }

  if (typeof o.result === "string") {
    const lower = o.result.toLowerCase();
    return lower.includes("error") ||
           lower.includes("failed") ||
           o.result.includes("SIGKILL") ||
           o.result.includes("non-zero code");
  }

  if (o.metadata && typeof o.metadata === "object") {
    const meta = o.metadata as Record<string, unknown>;
    if (meta.error || meta.failed) return true;
  }

  return false;
}

function extractErrorMessage(output: unknown): string {
  if (typeof output === "object" && output !== null) {
    const o = output as Record<string, unknown>;
    if (typeof o.output === "string") return o.output;
    if (typeof o.result === "string") return o.result;
    if (o.metadata && typeof o.metadata === "object") {
      const meta = o.metadata as Record<string, unknown>;
      if (typeof meta.error === "string") return meta.error;
      if (typeof meta.message === "string") return meta.message;
    }
  }
  return "Unknown error";
}

function createLessonFromFailure(failure: FailureEvent): PendingLesson {
  const tool = failure.tool;
  const error = sanitizeError(failure.error);
  const errorLower = error.toLowerCase();

  let constraint = "Analyze error message and adjust approach";
  let successIndicator = "operation completed successfully";

  if (errorLower.includes("permission denied") || errorLower.includes("access denied")) {
    constraint = "Use sudo or check file permissions";
    successIndicator = "command executed without permission errors";
  } else if (errorLower.includes("no such file") || errorLower.includes("not found")) {
    constraint = "Verify file path exists before operation";
    successIndicator = "file/path found and accessible";
  } else if (errorLower.includes("connection") || errorLower.includes("timeout")) {
    constraint = "Check network connectivity and endpoint availability";
    successIndicator = "connection established successfully";
  } else if (errorLower.includes("authentication") || errorLower.includes("unauthorized")) {
    constraint = "Verify credentials and authentication tokens";
    successIndicator = "authenticated successfully";
  } else if (errorLower.includes("docker")) {
    constraint = "For Docker: rebuild without cache, ensure Dockerfile exists";
    successIndicator = "docker build succeeded";
  } else if (errorLower.includes("ssh")) {
    constraint = "For SSH: verify key permissions (chmod 600), check host key acceptance";
    successIndicator = "ssh connection successful";
  } else if (errorLower.includes("rsync")) {
    constraint = "For rsync: use --delete carefully, check source/target paths";
    successIndicator = "rsync completed without errors";
  }

  return {
    id: generateLessonId(),
    tool,
    workspacePattern: failure.workspace.includes("/") ? failure.workspace.split("/").slice(-2).join("/") : "*",
    errorSemantic: error.substring(0, 200),
    constraint,
    successIndicator,
    confidence: 0.5,
    triggerCount: 1,
    createdAt: new Date().toISOString()
  };
}

function storeUnresolvedError(failure: FailureEvent, embedding: number[]) {
  const unresolved = loadUnresolved();
  const sanitizedError = sanitizeError(failure.error);

  const existing = unresolved.find(
    u => u.errorText.substring(0, 200) === sanitizedError.substring(0, 200) &&
         u.workspacePattern === failure.workspace
  );

  if (existing) {
    existing.occurrences++;
    existing.lastSeen = new Date().toISOString();
  } else {
    unresolved.push({
      id: `unres_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      tool: failure.tool,
      workspacePattern: failure.workspace,
      errorEmbedding: embedding,
      errorText: sanitizedError,
      occurrences: 1,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    });
  }

  saveUnresolved(unresolved);
}

function extractToolFromArgs(args: Record<string, unknown>): string {
  if (args.command && typeof args.command === "string") {
    const cmd = args.command.split(" ")[0];
    if (cmd === "git" && args.command.includes("commit")) return "git-commit";
    if (cmd === "git" && args.command.includes("push")) return "git-push";
    if (cmd === "git" && args.command.includes("pull")) return "git-pull";
    if (cmd === "git" && args.command.includes("add")) return "git-add";
    if (cmd === "rsync") return "rsync";
    if (cmd === "ssh") return "ssh";
    if (cmd === "docker") return "docker";
    if (cmd === "npm") return "npm";
    if (cmd === "node") return "node";
  }
  return "unknown";
}

function learnWorkspaceConventions(tool: string, args: Record<string, unknown>, workspace: string, success: boolean) {
  if (!success) return;

  const conventions = loadConventions();
  const workspaceKey = workspace.includes("/") ? workspace.split("/").slice(-2).join("/") : workspace;

  if (tool === "git-commit" && args.command) {
    const msgMatch = (args.command as string).match(/-m ["']([^"']+)["']/);
    if (msgMatch) {
      const existing = conventions.find(
        c => c.workspacePattern === workspaceKey && c.conventionType === "commit_format"
      );
      if (existing) {
        existing.sampleCount++;
        existing.confidence = Math.min(0.95, existing.confidence + 0.02);
      } else {
        conventions.push({
          id: generateConventionId(),
          workspacePattern: workspaceKey,
          conventionType: "commit_format",
          value: msgMatch[1].substring(0, 50),
          confidence: 0.3,
          sampleCount: 1,
          createdAt: new Date().toISOString()
        });
      }
    }
  }

  if (tool === "git-add" && args.command) {
    const hasDot = (args.command as string).includes("git add .");
    const existing = conventions.find(
      c => c.workspacePattern === workspaceKey && c.conventionType === "git_add_pattern"
    );
    if (existing) {
      existing.sampleCount++;
      if (hasDot) existing.confidence = Math.min(0.95, existing.confidence + 0.05);
    } else {
      conventions.push({
        id: generateConventionId(),
        workspacePattern: workspaceKey,
        conventionType: "git_add_pattern",
        value: hasDot ? "git add ." : "git add <specific files>",
        confidence: 0.5,
        sampleCount: 1,
        createdAt: new Date().toISOString()
      });
    }
  }

  saveConventions(conventions);

  try {
    const coll = conventionsCollection;
    if (coll && conventions.length > 0) {
      const lastConv = conventions[conventions.length - 1];
      const embedding = textToEmbedding(`${lastConv.workspacePattern} ${lastConv.conventionType} ${lastConv.value}`);
      coll.insertSync([{ id: `doc_${lastConv.id}`, vectors: { embedding } }]);
    }
  } catch {
  }
}

function applyConfidenceDecay(lesson: Lesson, config: Config): Lesson {
  if (!config.confidenceDecay || !lesson.lastAccessed) {
    return lesson;
  }

  const lastAccess = new Date(lesson.lastAccessed).getTime();
  const now = Date.now();
  const daysSince = (now - lastAccess) / (1000 * 60 * 60 * 24);
  const halfLifeFactor = Math.pow(0.5, daysSince / config.halfLifeDays);

  lesson.confidence = lesson.confidence * halfLifeFactor;

  if (lesson.confidence < 0.1) {
    return null as any;
  }

  return lesson;
}

function parseCommand(input: string): { command: string; args: string[] } | null {
  const match = input.match(/^openlearn:\s*(.+)?$/i);
  if (!match) return null;

  const rest = match[1] || "";
  const parts = rest.split(/\s+/).filter(Boolean);
  const command = parts[0]?.toLowerCase() || "help";
  const args = parts.slice(1);

  return { command, args };
}

function formatLessonForDisplay(lesson: Lesson | PendingLesson, index?: number): string {
  const conf = lesson.confidence >= 0.7 ? "🟢" : lesson.confidence >= 0.4 ? "🟡" : "🔴";
  const idx = index !== undefined ? `[${index}] ` : "";
  return `${idx}${conf} ${lesson.tool} • "${lesson.errorSemantic.substring(0, 50)}..." → "${lesson.constraint}"`;
}

function cmdHelp(): ChatResponse {
  return {
    type: "text",
    text: `**openlearn commands:**

\`openlearn: help\` - Show this help
\`openlearn: list\` - Summary of learnings
\`openlearn: list --all\` - Full paginated list
\`openlearn: list --pending\` - Pending review
\`openlearn: list <tool>\` - Filter by tool

\`openlearn: review\` - Interactive pending review
\`openlearn: approve <id>\` - Approve specific lesson
\`openlearn: reject <id>\` - Reject specific lesson

\`openlearn: history <id>\` - Show version history
\`openlearn: rollback <id>\` - Interactively rollback

\`openlearn: export\` - Print JSON backup
\`openlearn: import <json>\` - Import from JSON

\`openlearn: config\` - Show current config
\`openlearn: config set <key> <val>\` - Set config

\`openlearn: clear\` - Clear all learnings
\`openlearn: clear --lessons\` - Clear only lessons
\`openlearn: clear --pending\` - Clear only pending

**Learning Modes:** \`full\` (auto-learn) | \`suggest\` (require approval) | \`off\` (disabled)`
  };
}

function cmdList(args: string[], config: Config): ChatResponse {
  const allLessons = loadAllLessons();
  const pending = loadPending();
  const lessons = allLessons.filter(l => l.status === "active");
  const sequences = loadSequences();
  const conventions = loadConventions();

  if (args.includes("--pending")) {
    if (pending.length === 0) {
      return { type: "text", text: "✅ No pending lessons. You're all caught up!" };
    }

    let output = `**📋 Pending Review** (${pending.length} lesson${pending.length > 1 ? "s" : ""})\n\n`;
    pending.forEach((p, i) => {
      output += `${formatLessonForDisplay(p, i + 1)}\n`;
      output += `   Confidence: ${(p.confidence * 100).toFixed(0)}% • ${p.triggerCount} trigger${p.triggerCount > 1 ? "s" : ""}\n`;
      output += `   Workspace: ${p.workspacePattern}\n\n`;
    });
    output += "Run `openlearn: review` to interactively approve/reject.";

    return { type: "text", text: output };
  }

  if (args.includes("--all")) {
    if (lessons.length === 0) {
      return { type: "text", text: "📚 No active lessons yet. Start using OpenCode to learn!" };
    }

    let output = `**📚 All Lessons** (${lessons.length} total)\n\n`;
    lessons.forEach((l, i) => {
      output += `${formatLessonForDisplay(l, i + 1)}\n`;
    });

    return { type: "text", text: output };
  }

  const toolFilter = args.find(a => !a.startsWith("--"));
  let filtered = lessons;
  if (toolFilter) {
    filtered = lessons.filter(l => l.tool.toLowerCase().includes(toolFilter.toLowerCase()));
    if (filtered.length === 0) {
      return { type: "error", text: `No lessons found for tool "${toolFilter}".` };
    }
  }

  const high = filtered.filter(l => l.confidence >= 0.7).length;
  const medium = filtered.filter(l => l.confidence >= 0.4 && l.confidence < 0.7).length;
  const low = filtered.filter(l => l.confidence < 0.4).length;

  const modeIcon = config.learningMode === "full" ? "📖" : config.learningMode === "suggest" ? "⏳" : "🚫";
  const modeText = config.learningMode === "full" ? "Learning + auto-inject"
    : config.learningMode === "suggest" ? "Learning + suggest (pending approval)"
    : "Learning disabled";

  let output = `**📚 openlearn Status**\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  output += `Mode: ${modeIcon} ${modeText}\n`;
  output += `Auto-inject threshold: ${(config.autoInjectThreshold * 100).toFixed(0)}%\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  output += `Lessons: ${filtered.length} ${toolFilter ? `(filtered: ${toolFilter})` : ""}\n`;
  output += `  🟢 High: ${high} | 🟡 Medium: ${medium} | 🔴 Low: ${low}\n`;
  output += `⏳ Pending: ${pending.length}\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  output += `Sequences: ${sequences.length} | Conventions: ${conventions.length}\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  output += `Run \`openlearn: list --all\` for full list\n`;
  output += `Run \`openlearn: list --pending\` for pending review`;

  return { type: "text", text: output };
}

function cmdReview(pending: PendingLesson[]): ChatResponse {
  if (pending.length === 0) {
    return { type: "text", text: "✅ No pending lessons to review. You're all caught up!" };
  }

  const first = pending[0];
  const output = `**📋 Pending Review (${pending.length} total)**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Lesson:** ${first.id}
**Tool:** ${first.tool}
**Workspace:** ${first.workspacePattern}
**Error:** "${first.errorSemantic.substring(0, 100)}..."
**Constraint:** "${first.constraint}"
**Confidence:** ${(first.confidence * 100).toFixed(0)}%
**Triggers:** ${first.triggerCount}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Approve? \`y\` = approve, \`n\` = reject, \`s\` = skip, \`q\` = quit`;

  return { type: "text", text: output };
}

function cmdApprove(lessonId: string, pending: PendingLesson[]): ChatResponse {
  const idx = pending.findIndex(p => p.id === lessonId || p.id.includes(lessonId));
  if (idx === -1) {
    return { type: "error", text: `Pending lesson "${lessonId}" not found. Run \`openlearn: list --pending\` to see pending lessons.` };
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

  addAuditEntry("approved", lesson.id, `Approved pending lesson for "${lesson.tool}"`);

  const coll = lessonsCollection;
  if (coll) {
    const embedding = textToEmbedding(`${lesson.tool} ${lesson.errorSemantic}`);
    coll.insertSync([{ id: `doc_${lesson.id}`, vectors: { embedding } }]);
  }

  return { type: "text", text: `✅ Lesson approved and activated!\nRun \`openlearn: list\` to see your updated lessons.` };
}

function cmdReject(lessonId: string, pending: PendingLesson[]): ChatResponse {
  const idx = pending.findIndex(p => p.id === lessonId || p.id.includes(lessonId));
  if (idx === -1) {
    return { type: "error", text: `Pending lesson "${lessonId}" not found.` };
  }

  const rejected = pending.splice(idx, 1)[0];
  savePending(pending);

  addAuditEntry("rejected", rejected.id, `Rejected pending lesson for "${rejected.tool}"`);

  return { type: "text", text: `❌ Lesson rejected and deleted.\nRun \`openlearn: list --pending\` to see remaining pending lessons.` };
}

function cmdHistory(lessonId: string): ChatResponse {
  const allLessons = loadAllLessons();
  const lesson = allLessons.find(l => l.id === lessonId || l.id.includes(lessonId));

  if (!lesson) {
    return { type: "error", text: `Lesson "${lessonId}" not found.` };
  }

  const history = loadHistory();
  const entries = history[lesson.id] || [];

  if (entries.length === 0) {
    return { type: "text", text: `No history available for lesson "${lessonId}".` };
  }

  let output = `**📜 History for ${lesson.id}**\n\n`;
  entries.forEach(e => {
    const actionIcon = e.action === "rolled_back" ? "↩️" : e.action === "approved" ? "✅" : "📝";
    output += `${actionIcon} v${e.version}: ${e.constraint}\n`;
    output += `   Confidence: ${(e.confidence * 100).toFixed(0)}% | ${e.changedAt}\n\n`;
  });

  return { type: "text", text: output };
}

function cmdRollback(lessonId: string, allLessons: Lesson[], history: LessonHistory): ChatResponse {
  const lesson = allLessons.find(l => l.id === lessonId || l.id.includes(lessonId));
  if (!lesson) {
    return { type: "error", text: `Lesson "${lessonId}" not found.` };
  }

  const entries = history[lesson.id] || [];
  if (entries.length <= 1) {
    return { type: "error", text: `No previous version to rollback to for lesson "${lessonId}".` };
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

  return { type: "text", text: `↩️ Rolled back lesson "${lesson.id}" to v${previous.version}.\nNew constraint: "${lesson.constraint}"` };
}

function cmdExport(): ChatResponse {
  const lessons = loadAllLessons().filter(l => l.status === "active");
  const pending = loadPending();
  const config = loadConfig();
  const exportData = { lessons, pending, config, exportedAt: new Date().toISOString() };

  return { type: "text", text: `**📤 Export Data**\n\n\`\`\`json\n${JSON.stringify(exportData, null, 2)}\n\`\`\`\n\nCopy the JSON above to import elsewhere.` };
}

function cmdImport(jsonStr: string): ChatResponse {
  try {
    const data = JSON.parse(jsonStr);

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

    return { type: "text", text: `✅ Import successful!\nRun \`openlearn: list\` to see your lessons.` };
  } catch {
    return { type: "error", text: "Invalid JSON format. Please provide valid JSON from `openlearn: export`." };
  }
}

function cmdConfig(args: string[]): ChatResponse {
  const config = loadConfig();

  if (args[0] === "set" && args[1] && args[2]) {
    const key = args[1] as keyof Config;
    const value = args[2];

    if (key === "learningMode") {
      if (!["full", "suggest", "off"].includes(value)) {
        return { type: "error", text: "learningMode must be: full, suggest, or off" };
      }
      config.learningMode = value as LearningMode;
    } else if (key === "autoInjectThreshold") {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0 || num > 1) {
        return { type: "error", text: "autoInjectThreshold must be between 0 and 1" };
      }
      config.autoInjectThreshold = num;
    } else if (key === "confidenceDecay") {
      config.confidenceDecay = value === "true";
    } else if (key === "showSequences") {
      config.showSequences = value === "true";
    } else if (key === "showConventions") {
      config.showConventions = value === "true";
    } else {
      return { type: "error", text: `Unknown config key "${key}". Run \`openlearn: config\` to see all keys.` };
    }

    saveConfig(config);
    return { type: "text", text: `✅ Config updated: ${key} = ${value}` };
  }

  if (args.includes("--list")) {
    return {
      type: "text",
      text: `**⚙️ Config Options**

\`learningMode\` - full | suggest | off
\`autoInjectThreshold\` - 0.0 to 1.0 (default: 0.7)
\`confidenceDecay\` - true | false (default: true)
\`showSequences\` - true | false (default: true)
\`showConventions\` - true | false (default: true)

Example: \`openlearn: config set learningMode suggest\``
    };
  }

  const modeText = config.learningMode === "full" ? "Learning + auto-inject"
    : config.learningMode === "suggest" ? "Learning + suggest (pending approval)"
    : "Learning disabled";

  return {
    type: "text",
    text: `**⚙️ Current Config**

\`\`\`
learningMode: ${modeText}
autoInjectThreshold: ${(config.autoInjectThreshold * 100).toFixed(0)}%
confidenceDecay: ${config.confidenceDecay}
showSequences: ${config.showSequences}
showConventions: ${config.showConventions}
\`\`\`

Run \`openlearn: config --list\` for all options.`
  };
}

function cmdClear(args: string[]): ChatResponse {
  if (args.includes("--lessons")) {
    const allLessons = loadAllLessons().filter(l => l.status === "pending");
    saveLessons(allLessons);
    addAuditEntry("cleared", undefined, "Cleared all active lessons");
    return { type: "text", text: "🗑️ All active lessons cleared. Pending lessons preserved." };
  }

  if (args.includes("--pending")) {
    savePending([]);
    addAuditEntry("cleared", undefined, "Cleared all pending lessons");
    return { type: "text", text: "🗑️ All pending lessons cleared." };
  }

  saveLessons([]);
  savePending([]);
  saveSequences([]);
  saveConventions([]);
  saveUnresolved([]);
  saveHistory({});
  saveAudit([]);

  try {
    const fs = require('fs');
    if (fs.existsSync(ZVEC_PATH)) fs.rmSync(ZVEC_PATH);
    if (fs.existsSync(SEQ_ZVEC_PATH)) fs.rmSync(SEQ_ZVEC_PATH);
    if (fs.existsSync(CONV_ZVEC_PATH)) fs.rmSync(CONV_ZVEC_PATH);
  } catch {
  }

  lessonsCollection = null;
  sequencesCollection = null;
  conventionsCollection = null;

  addAuditEntry("cleared", undefined, "Cleared all data");

  return { type: "text", text: "🗑️ **All learnings cleared.** Type \`openlearn: list\` to start fresh." };
}

export const OpenLearnPlugin: Plugin = async (ctx) => {
  let currentWorkspace = "/";
  let currentTool = "";
  let pendingFailure: FailureEvent | null = null;
  let toolSequence: SequenceStep[] = [];
  let toolSequenceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingReviewIndex = 0;

  initZVecCollections();
  const config = loadConfig();

  const flushSequence = () => {
    if (toolSequence.length < 2) {
      toolSequence = [];
      return;
    }

    if (!config.showSequences) {
      toolSequence = [];
      return;
    }

    const sequences = loadSequences();
    const sequenceTools = toolSequence.map(s => s.tool);
    const sequenceKey = sequenceTools.join(" → ");
    const successRate = toolSequence.filter(s => s.success).length / toolSequence.length;
    const workspaceKey = currentWorkspace.includes("/") ? currentWorkspace.split("/").slice(-2).join("/") : "*";

    const existing = sequences.find(s => s.tools.join(" → ") === sequenceKey && s.workspacePattern === workspaceKey);

    if (existing) {
      existing.totalRuns++;
      if (successRate > 0.5) existing.successfulRuns++;
      existing.successRate = existing.successfulRuns / existing.totalRuns;
      existing.lastAccessed = new Date().toISOString();
    } else {
      sequences.push({
        id: generateSequenceId(),
        tools: sequenceTools,
        workspacePattern: workspaceKey,
        successRate,
        totalRuns: 1,
        successfulRuns: successRate > 0.5 ? 1 : 0,
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString()
      });

      try {
        const coll = sequencesCollection;
        if (coll) {
          const embedding = textToEmbedding(`${workspaceKey} ${sequenceKey}`);
          coll.insertSync([{ id: `doc_${sequences[sequences.length - 1].id}`, vectors: { embedding } }]);
        }
      } catch {
      }
    }

    saveSequences(sequences);
    toolSequence = [];
  };

  const toolExecuteAfterHook = async (
    input: { tool: string; args?: Record<string, unknown> },
    output: { result?: unknown; output?: unknown; metadata?: Record<string, unknown> }
  ) => {
    const toolOutput = output.output ?? output.result;
    const failure = isFailure(toolOutput);
    const toolName = extractToolFromArgs(input.args || {});

    if (toolSequence.length > 0 && toolSequence[toolSequence.length - 1].tool === toolName) {
      toolSequence[toolSequence.length - 1].success = !failure;
      toolSequence[toolSequence.length - 1].timestamp = Date.now();
    } else {
      toolSequence.push({
        tool: toolName,
        args: input.args || {},
        success: !failure,
        timestamp: Date.now()
      });
    }

    if (toolSequenceTimer) clearTimeout(toolSequenceTimer);
    toolSequenceTimer = setTimeout(flushSequence, 30000);

    learnWorkspaceConventions(toolName, input.args || {}, currentWorkspace, !failure);

    if (!failure) {
      if (pendingFailure) {
        const allLessons = loadAllLessons();
        const existing = allLessons.find(
          l => l.status === "active" && l.errorSemantic === sanitizeError(pendingFailure.error).substring(0, 200)
        );

        if (existing) {
          existing.triggerCount++;
          existing.confidence = Math.min(0.95, existing.confidence + 0.05);
          existing.lastAccessed = new Date().toISOString();
          if (existing.unresolvedCount && existing.unresolvedCount > 0) {
            existing.unresolvedCount = 0;
          }
          saveLessons(allLessons);
          addAuditEntry("used", existing.id, `Reinforced after success`);
        }

        pendingFailure = null;
      }
      return;
    }

    const errorMsg = extractErrorMessage(toolOutput);
    const sanitizedError = sanitizeError(errorMsg);

    if (sanitizedError === "Unknown error") return;

    const currentFailure: FailureEvent = {
      tool: toolName,
      args: input.args || {},
      error: sanitizedError,
      workspace: currentWorkspace,
      timestamp: new Date().toISOString()
    };

    const allLessons = loadAllLessons();
    const errorEmbedding = textToEmbedding(`${toolName} ${sanitizedError}`);

    const existingLesson = allLessons.find(
      l => l.status === "active" &&
           l.errorSemantic.substring(0, 200) === sanitizedError.substring(0, 200) &&
           (l.workspacePattern === "*" || currentWorkspace.includes(l.workspacePattern))
    );

    if (existingLesson) {
      existingLesson.triggerCount++;
      existingLesson.confidence = Math.min(0.95, existingLesson.confidence + 0.1);
      existingLesson.lastAccessed = new Date().toISOString();
      existingLesson.unresolvedCount = 0;
      saveLessons(allLessons);
      pendingFailure = null;
      return;
    }

    if (config.learningMode === "off") {
      return;
    }

    const newPending = createLessonFromFailure(currentFailure);

    if (newPending.constraint === "Analyze error message and adjust approach") {
      storeUnresolvedError(currentFailure, errorEmbedding);
    }

    if (config.learningMode === "suggest") {
      const pending = loadPending();
      const duplicate = pending.find(p =>
        p.errorSemantic.substring(0, 200) === sanitizedError.substring(0, 200) &&
        p.tool === toolName
      );

      if (!duplicate) {
        pending.push(newPending);
        savePending(pending);
        addAuditEntry("created", newPending.id, `New pending lesson for "${toolName}"`);
      }
      pendingFailure = currentFailure;
      return;
    }

    const lesson: Lesson = {
      ...newPending,
      status: "active",
      lastRetrieved: new Date().toISOString(),
      lastAccessed: new Date().toISOString()
    };

    allLessons.push(lesson);
    saveLessons(allLessons);

    addHistoryEntry(lesson.id, {
      constraint: lesson.constraint,
      confidence: lesson.confidence,
      changedAt: new Date().toISOString(),
      action: "created"
    });

    addAuditEntry("created", lesson.id, `New lesson for "${toolName}"`);

    try {
      const coll = lessonsCollection;
      if (coll) {
        coll.insertSync([{ id: `doc_${lesson.id}`, vectors: { embedding: errorEmbedding } }]);
      }
    } catch {
    }

    pendingFailure = currentFailure;
  };

  const chatMessageHook = async (
    input: { sessionID: string; agent?: string; cwd?: string },
    output: { message: Record<string, unknown>; parts: Array<{ type: string; text?: string }> }
  ) => {
    if (input.cwd) {
      currentWorkspace = extractWorkspace(input.cwd);
    }

    const firstTextPart = output.parts.find(p => p.type === "text");
    if (!firstTextPart?.text) return;

    const parsed = parseCommand(firstTextPart.text);
    if (!parsed) {
      if (!currentTool) return;

      const lessons = loadAllLessons().filter(l => l.status === "active");
      const sequences = loadSequences();
      const conventions = loadConventions();
      const cfg = loadConfig();

      let relevantLessons: Lesson[] = [];
      let relevantSequences: ToolSequence[] = [];
      let relevantConventions: WorkspaceConvention[] = [];

      const coll = lessonsCollection;
      const seqColl = sequencesCollection;
      const convColl = conventionsCollection;

      try {
        if (coll) {
          const queryEmbedding = textToEmbedding(`${currentTool} ${currentWorkspace}`);
          const results = coll.querySync({ fieldName: "embedding", vector: queryEmbedding, topk: 3 });
          if (results && results.length > 0) {
            const matchedIds = results.map((r: ZVecDoc) => r.id.replace("doc_lesson_", "lesson_") || "");
            relevantLessons = lessons.filter(l => matchedIds.includes(l.id) && l.confidence >= cfg.autoInjectThreshold);
          }
        }
      } catch {
        relevantLessons = lessons
          .filter(l => {
            const toolMatch = l.tool === currentTool || l.tool === "*";
            const workspaceMatch = l.workspacePattern === "*" || currentWorkspace.includes(l.workspacePattern);
            return toolMatch && workspaceMatch && l.confidence >= cfg.autoInjectThreshold;
          })
          .sort((a, b) => (b.confidence * b.triggerCount) - (a.confidence * a.triggerCount))
          .slice(0, 3);
      }

      try {
        if (seqColl && cfg.showSequences) {
          const workspaceKey = currentWorkspace.includes("/") ? currentWorkspace.split("/").slice(-2).join("/") : "*";
          const seqQueryEmbedding = textToEmbedding(`${workspaceKey} ${currentTool}`);
          const seqResults = seqColl.querySync({ fieldName: "embedding", vector: seqQueryEmbedding, topk: 2 });
          if (seqResults && seqResults.length > 0) {
            const matchedIds = seqResults.map((r: ZVecDoc) => r.id.replace("doc_seq_", "seq_") || "");
            relevantSequences = sequences.filter(s => matchedIds.includes(s.id));
          }
        }
      } catch {
        relevantSequences = sequences
          .filter(s => s.tools[0] === currentTool && s.successRate > 0.6)
          .sort((a, b) => b.successRate - a.successRate)
          .slice(0, 2);
      }

      try {
        if (convColl && cfg.showConventions) {
          const workspaceKey = currentWorkspace.includes("/") ? currentWorkspace.split("/").slice(-2).join("/") : "*";
          const convQueryEmbedding = textToEmbedding(`${workspaceKey}`);
          const convResults = convColl.querySync({ fieldName: "embedding", vector: convQueryEmbedding, topk: 5 });
          if (convResults && convResults.length > 0) {
            const matchedIds = convResults.map((r: ZVecDoc) => r.id.replace("doc_conv_", "conv_") || "");
            relevantConventions = conventions.filter(c => matchedIds.includes(c.id));
          }
        }
      } catch {
        const workspaceKey = currentWorkspace.includes("/") ? currentWorkspace.split("/").slice(-2).join("/") : "*";
        relevantConventions = conventions.filter(c => c.workspacePattern === workspaceKey);
      }

      const contextParts: string[] = [];

      if (relevantLessons.length > 0) {
        const constraints = relevantLessons
          .map((l, i) => `Lesson ${i + 1}: ${l.constraint}`)
          .join("\n");
        contextParts.push(`[LEARNED CONSTRAINTS]\n${constraints}`);
      }

      if (relevantSequences.length > 0) {
        const seqs = relevantSequences
          .map(s => `"${s.tools.join(" → ")}" (${(s.successRate * 100).toFixed(0)}% success)`)
          .join(", ");
        contextParts.push(`[KNOWN SEQUENCES] ${seqs}`);
      }

      if (relevantConventions.length > 0) {
        const convs = relevantConventions
          .filter(c => c.confidence > 0.5)
          .map(c => `${c.conventionType}: ${c.value}`)
          .join("; ");
        if (convs) contextParts.push(`[WORKSPACE CONVENTIONS] ${convs}`);
      }

      if (contextParts.length > 0) {
        const contextBlock = `\n\n${contextParts.join("\n")}\n\n`;
        firstTextPart.text = contextBlock + firstTextPart.text;
      }
      return;
    }

    const { command, args } = parsed;
    const currentConfig = loadConfig();
    const pending = loadPending();
    const allLessons = loadAllLessons();
    const history = loadHistory();

    let response: ChatResponse = { type: "text", text: "Unknown command. Run `openlearn: help`." };

    switch (command) {
      case "help":
        response = cmdHelp();
        break;
      case "list":
        response = cmdList(args, currentConfig);
        break;
      case "review":
        response = cmdReview(pending);
        break;
      case "approve":
        response = cmdApprove(args[0] || "", pending);
        break;
      case "reject":
        response = cmdReject(args[0] || "", pending);
        break;
      case "history":
        response = cmdHistory(args[0] || "");
        break;
      case "rollback":
        response = cmdRollback(args[0] || "", allLessons, history);
        break;
      case "export":
        response = cmdExport();
        break;
      case "import":
        response = cmdImport(firstTextPart.text.replace(/^openlearn:\s*import\s*/i, ""));
        break;
      case "config":
        response = cmdConfig(args);
        break;
      case "clear":
        response = cmdClear(args);
        break;
      default:
        response = { type: "text", text: `Unknown command "${command}". Run \`openlearn: help\` for available commands.` };
    }

    const idx = output.parts.findIndex(p => p.type === "text");
    if (idx >= 0) {
      output.parts[idx].text = response.text;
    }
  };

  const chatParamsHook = async (
    input: { sessionID: string; agent?: string },
    output: { temperature?: number; topP?: number; topK?: number; options: Record<string, unknown> }
  ) => {
    const lessons = loadAllLessons().filter(l => l.status === "active");
    const highConfidenceCount = lessons.filter(l => l.confidence > 0.7).length;
    const unresolved = loadUnresolved().filter(u => u.occurrences >= UNRESOLVED_THRESHOLD);

    if (highConfidenceCount > 5) {
      output.options.learnedContext = `${highConfidenceCount} high-confidence lessons available`;
    }

    if (unresolved.length > 0) {
      output.options.unresolvedWarnings = `${unresolved.length} recurring error(s) need attention`;
    }
  };

  const toolExecuteBeforeHook = async (
    input: { tool: string; args?: Record<string, unknown> },
    output: Record<string, unknown>
  ) => {
    currentTool = extractToolFromArgs(input.args || {});

    if (input.args?.cwd) {
      currentWorkspace = extractWorkspace(input.args.cwd as string);
    }

    const lessons = loadAllLessons().filter(l => l.status === "active");
    const sequences = loadSequences();
    const cfg = loadConfig();

    let relevantLessons: Lesson[] = [];
    let relevantSequences: ToolSequence[] = [];

    const coll = lessonsCollection;
    const seqColl = sequencesCollection;

    try {
      if (coll) {
        const queryEmbedding = textToEmbedding(`${currentTool} ${currentWorkspace}`);
        const results = coll.querySync({ fieldName: "embedding", vector: queryEmbedding, topk: 3 });
        if (results && results.length > 0) {
          const matchedIds = results.map((r: ZVecDoc) => r.id.replace("doc_lesson_", "lesson_") || "");
          relevantLessons = lessons.filter(l => matchedIds.includes(l.id));
        }
      }
    } catch {
      relevantLessons = lessons
        .filter(l => {
          const toolMatch = l.tool === currentTool || l.tool === "*";
          const workspaceMatch = l.workspacePattern === "*" || currentWorkspace.includes(l.workspacePattern);
          return toolMatch && workspaceMatch;
        })
        .slice(0, 3);
    }

    try {
      if (seqColl && cfg.showSequences) {
        const workspaceKey = currentWorkspace.includes("/") ? currentWorkspace.split("/").slice(-2).join("/") : "*";
        const seqQueryEmbedding = textToEmbedding(`${workspaceKey} ${currentTool}`);
        const seqResults = seqColl.querySync({ fieldName: "embedding", vector: seqQueryEmbedding, topk: 1 });
        if (seqResults && seqResults.length > 0) {
          const matchedIds = seqResults.map((r: ZVecDoc) => r.id.replace("doc_seq_", "seq_") || "");
          relevantSequences = sequences.filter(s => matchedIds.includes(s.id));
        }
      }
    } catch {
      relevantSequences = sequences
        .filter(s => s.tools[0] === currentTool && s.successRate > 0.6)
        .sort((a, b) => b.successRate - a.successRate)
        .slice(0, 1);
    }

    if (relevantSequences.length > 0) {
      const seq = relevantSequences[0];
      output.hint = `[openlearn] 🔗 Sequence detected: "${seq.tools.join(" → ")}" started`;
    }

    if (relevantLessons.length > 0) {
      const warnings = relevantLessons
        .filter(l => l.confidence >= cfg.autoInjectThreshold)
        .map(l => `[LEARNED] ${l.constraint}`)
        .join("\n");
      if (warnings) {
        output.hint = `[openlearn] ${currentTool}:\n${warnings}`;
      }
    }
  };

  const eventHook = async (input: { event: { type: string; properties?: Record<string, unknown> } }, output: Record<string, unknown>) => {
    const event = input.event;
    if (event.type === "session.created") {
      const props = event.properties as { cwd?: string } | undefined;
      if (props?.cwd) {
        currentWorkspace = extractWorkspace(props.cwd);
      }
      toolSequence = [];
      const cfg = loadConfig();
      const pending = loadPending();
      const lessons = loadAllLessons().filter(l => l.status === "active");

      if (cfg.learningMode !== "off" && pending.length > 0) {
        output.hint = `[openlearn] 📚 ${pending.length} pending lesson(s) awaiting review. Run \`openlearn: review\` or \`openlearn: list --pending\``;
      }
    }
  };

  return {
    name: "openlearn",
    hooks: {
      toolExecuteAfterHook,
      chatMessageHook,
      chatParamsHook,
      toolExecuteBeforeHook,
      eventHook
    }
  };
};