import type { Plugin } from "@opencode-ai/plugin";
import path from "path";
import fs from "fs";
import { ZVecCollectionSchema, ZVecCreateAndOpen, ZVecDataType, ZVecDoc } from "@zvec/zvec";

const DATA_DIR = path.join(process.env.HOME || "/root", ".openlearn");
const DB_PATH = path.join(DATA_DIR, "lessons.json");
const ZVEC_PATH = path.join(DATA_DIR, "lessons.zvec");
const SEQ_ZVEC_PATH = path.join(DATA_DIR, "sequences.zvec");
const CONV_ZVEC_PATH = path.join(DATA_DIR, "conventions.zvec");
const UNRESOLVED_PATH = path.join(DATA_DIR, "unresolved.json");

const SEQ_WINDOW = 5;
const UNRESOLVED_THRESHOLD = 5;

interface Lesson {
  id: string;
  tool: string;
  workspacePattern: string;
  errorSemantic: string;
  constraint: string;
  successIndicator?: string;
  confidence: number;
  triggerCount: number;
  createdAt: string;
  lastRetrieved?: string;
  lastAccessed?: string;
  vectorId?: number;
  unresolvedCount?: number;
}

interface ToolSequence {
  id: string;
  tools: string[];
  workspacePattern: string;
  successRate: number;
  totalRuns: number;
  successfulRuns: number;
  createdAt: string;
  lastAccessed?: string;
}

interface WorkspaceConvention {
  id: string;
  workspacePattern: string;
  conventionType: string;
  value: string;
  confidence: number;
  sampleCount: number;
  createdAt: string;
}

interface SequenceStep {
  tool: string;
  args: Record<string, unknown>;
  success: boolean;
  timestamp: number;
}

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

interface FailureEvent {
  tool: string;
  args: Record<string, unknown>;
  error: string;
  workspace: string;
  timestamp: string;
}

let lessonsCollection: ReturnType<typeof ZVecCreateAndOpen> | null = null;
let sequencesCollection: ReturnType<typeof ZVecCreateAndOpen> | null = null;
let conventionsCollection: ReturnType<typeof ZVecCreateAndOpen> | null = null;

function initLessonsZvec() {
  if (lessonsCollection) return lessonsCollection;

  const schema = new ZVecCollectionSchema({
    name: "lessons",
    vectors: {
      name: "embedding",
      dataType: ZVecDataType.VECTOR_FP32,
      dimension: 384
    }
  });

  try {
    lessonsCollection = ZVecCreateAndOpen(ZVEC_PATH, schema);
  } catch {
    try {
      fs.rmSync(ZVEC_PATH, { force: true });
      lessonsCollection = ZVecCreateAndOpen(ZVEC_PATH, schema);
    } catch {
      lessonsCollection = null;
    }
  }

  return lessonsCollection;
}

function initSequencesZvec() {
  if (sequencesCollection) return sequencesCollection;

  const schema = new ZVecCollectionSchema({
    name: "sequences",
    vectors: {
      name: "embedding",
      dataType: ZVecDataType.VECTOR_FP32,
      dimension: 384
    }
  });

  try {
    sequencesCollection = ZVecCreateAndOpen(SEQ_ZVEC_PATH, schema);
  } catch {
    try {
      fs.rmSync(SEQ_ZVEC_PATH, { force: true });
      sequencesCollection = ZVecCreateAndOpen(SEQ_ZVEC_PATH, schema);
    } catch {
      sequencesCollection = null;
    }
  }

  return sequencesCollection;
}

function initConventionsZvec() {
  if (conventionsCollection) return conventionsCollection;

  const schema = new ZVecCollectionSchema({
    name: "conventions",
    vectors: {
      name: "embedding",
      dataType: ZVecDataType.VECTOR_FP32,
      dimension: 384
    }
  });

  try {
    conventionsCollection = ZVecCreateAndOpen(CONV_ZVEC_PATH, schema);
  } catch {
    try {
      fs.rmSync(CONV_ZVEC_PATH, { force: true });
      conventionsCollection = ZVecCreateAndOpen(CONV_ZVEC_PATH, schema);
    } catch {
      conventionsCollection = null;
    }
  }

  return conventionsCollection;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadLessons(): Lesson[] {
  ensureDataDir();
  if (!fs.existsSync(DB_PATH)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveLessons(lessons: Lesson[]) {
  ensureDataDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(lessons, null, 2));
}

function loadSequences(): ToolSequence[] {
  const path = DB_PATH.replace("lessons.json", "sequences.json");
  ensureDataDir();
  if (!fs.existsSync(path)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(path, "utf-8"));
  } catch {
    return [];
  }
}

function saveSequences(sequences: ToolSequence[]) {
  const path = DB_PATH.replace("lessons.json", "sequences.json");
  ensureDataDir();
  fs.writeFileSync(path, JSON.stringify(sequences, null, 2));
}

function loadConventions(): WorkspaceConvention[] {
  const path = DB_PATH.replace("lessons.json", "conventions.json");
  ensureDataDir();
  if (!fs.existsSync(path)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(path, "utf-8"));
  } catch {
    return [];
  }
}

function saveConventions(conventions: WorkspaceConvention[]) {
  const path = DB_PATH.replace("lessons.json", "conventions.json");
  ensureDataDir();
  fs.writeFileSync(path, JSON.stringify(conventions, null, 2));
}

function loadUnresolved(): UnresolvedError[] {
  ensureDataDir();
  if (!fs.existsSync(UNRESOLVED_PATH)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(UNRESOLVED_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveUnresolved(unresolved: UnresolvedError[]) {
  ensureDataDir();
  fs.writeFileSync(UNRESOLVED_PATH, JSON.stringify(unresolved, null, 2));
}

function generateLessonId(): string {
  return `lesson_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function generateSequenceId(): string {
  return `seq_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function generateConventionId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function sanitizeError(error: string): string {
  return error
    .replace(/\d+\.\d+\.\d+\.\d+/g, "<IP>")
    .replace(/0x[0-9a-fA-F]+/g, "<HEX>")
    .replace(/\/home\/[^\/]+/g, "/home/<USER>")
    .replace(/\/Users\/[^\/]+/g, "/Users/<USER>")
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "<API_KEY>");
}

function extractWorkspace(cwd: string | undefined): string {
  if (!cwd) return "unknown";
  const parts = cwd.split("/");
  if (parts.length >= 3 && parts[2] === "Users") {
    return `~/.../${parts[parts.length - 1]}`;
  }
  return cwd;
}

function textToEmbedding(text: string): number[] {
  const embedding = new Array(384).fill(0);
  const words = text.toLowerCase().split(/\s+/);
  const uniqueWords = [...new Set(words)];

  for (let i = 0; i < uniqueWords.length; i++) {
    const word = uniqueWords[i];
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = ((hash << 5) - hash) + word.charCodeAt(j);
      hash = hash & hash;
    }
    const idx = Math.abs(hash) % 384;
    embedding[idx] += 1.0;
  }

  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (norm > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= norm;
    }
  }

  return embedding;
}

function generateConstraintFromEmbedding(errorEmbedding: number[]): { constraint: string; successIndicator: string } {
  const coll = initLessonsZvec();
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

function createLessonFromFailure(failure: FailureEvent): Lesson {
  const tool = failure.tool;
  const error = sanitizeError(failure.error);
  const errorLower = error.toLowerCase();

  if (errorLower.includes("permission denied") || errorLower.includes("access denied")) {
    return {
      id: generateLessonId(),
      tool,
      workspacePattern: failure.workspace.includes("/") ? failure.workspace.split("/").slice(-2).join("/") : "*",
      errorSemantic: error.substring(0, 200),
      constraint: "Use sudo or check file permissions",
      successIndicator: "command executed without permission errors",
      confidence: 0.5,
      triggerCount: 1,
      createdAt: new Date().toISOString(),
      lastRetrieved: new Date().toISOString()
    };
  } else if (errorLower.includes("no such file") || errorLower.includes("not found")) {
    return {
      id: generateLessonId(),
      tool,
      workspacePattern: failure.workspace.includes("/") ? failure.workspace.split("/").slice(-2).join("/") : "*",
      errorSemantic: error.substring(0, 200),
      constraint: "Verify file path exists before operation",
      successIndicator: "file/path found and accessible",
      confidence: 0.5,
      triggerCount: 1,
      createdAt: new Date().toISOString(),
      lastRetrieved: new Date().toISOString()
    };
  } else if (errorLower.includes("connection") || errorLower.includes("timeout")) {
    return {
      id: generateLessonId(),
      tool,
      workspacePattern: failure.workspace.includes("/") ? failure.workspace.split("/").slice(-2).join("/") : "*",
      errorSemantic: error.substring(0, 200),
      constraint: "Check network connectivity and endpoint availability",
      successIndicator: "connection established successfully",
      confidence: 0.5,
      triggerCount: 1,
      createdAt: new Date().toISOString(),
      lastRetrieved: new Date().toISOString()
    };
  } else if (errorLower.includes("authentication") || errorLower.includes("unauthorized")) {
    return {
      id: generateLessonId(),
      tool,
      workspacePattern: failure.workspace.includes("/") ? failure.workspace.split("/").slice(-2).join("/") : "*",
      errorSemantic: error.substring(0, 200),
      constraint: "Verify credentials and authentication tokens",
      successIndicator: "authenticated successfully",
      confidence: 0.5,
      triggerCount: 1,
      createdAt: new Date().toISOString(),
      lastRetrieved: new Date().toISOString()
    };
  } else if (errorLower.includes("docker")) {
    return {
      id: generateLessonId(),
      tool,
      workspacePattern: failure.workspace.includes("/") ? failure.workspace.split("/").slice(-2).join("/") : "*",
      errorSemantic: error.substring(0, 200),
      constraint: "For Docker: rebuild without cache, ensure Dockerfile exists",
      successIndicator: "docker build succeeded",
      confidence: 0.5,
      triggerCount: 1,
      createdAt: new Date().toISOString(),
      lastRetrieved: new Date().toISOString()
    };
  } else if (errorLower.includes("ssh")) {
    return {
      id: generateLessonId(),
      tool,
      workspacePattern: failure.workspace.includes("/") ? failure.workspace.split("/").slice(-2).join("/") : "*",
      errorSemantic: error.substring(0, 200),
      constraint: "For SSH: verify key permissions (chmod 600), check host key acceptance",
      successIndicator: "ssh connection successful",
      confidence: 0.5,
      triggerCount: 1,
      createdAt: new Date().toISOString(),
      lastRetrieved: new Date().toISOString()
    };
  } else if (errorLower.includes("rsync")) {
    return {
      id: generateLessonId(),
      tool,
      workspacePattern: failure.workspace.includes("/") ? failure.workspace.split("/").slice(-2).join("/") : "*",
      errorSemantic: error.substring(0, 200),
      constraint: "For rsync: use --delete carefully, check source/target paths",
      successIndicator: "rsync completed without errors",
      confidence: 0.5,
      triggerCount: 1,
      createdAt: new Date().toISOString(),
      lastRetrieved: new Date().toISOString()
    };
  }

  return {
    id: generateLessonId(),
    tool,
    workspacePattern: failure.workspace.includes("/") ? failure.workspace.split("/").slice(-2).join("/") : "*",
    errorSemantic: error.substring(0, 200),
    constraint: "Analyze error message and adjust approach",
    successIndicator: "operation completed successfully",
    confidence: 0.5,
    triggerCount: 1,
    createdAt: new Date().toISOString(),
    lastRetrieved: new Date().toISOString()
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

    if (existing.occurrences >= UNRESOLVED_THRESHOLD) {
      console.log(`[openlearn] ⚠️ UNRESOLVED ERROR (${existing.occurrences}x): "${existing.errorText.substring(0, 100)}"`);
      console.log(`[openlearn] Consider adding a lesson or fixing the root cause.`);
    }
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
    const coll = initConventionsZvec();
    if (coll && conventions.length > 0) {
      const lastConv = conventions[conventions.length - 1];
      const embedding = textToEmbedding(`${lastConv.workspacePattern} ${lastConv.conventionType} ${lastConv.value}`);
      coll.insertSync([{ id: `doc_${lastConv.id}`, vectors: { embedding } }]);
    }
  } catch {
  }
}

export const OpenLearnPlugin: Plugin = async (ctx) => {
  let currentWorkspace = "/";
  let currentTool = "";
  let pendingFailure: FailureEvent | null = null;
  let toolSequence: SequenceStep[] = [];
  let toolSequenceTimer: ReturnType<typeof setTimeout> | null = null;

  const flushSequence = () => {
    if (toolSequence.length < 2) {
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
        const coll = initSequencesZvec();
        if (coll) {
          const embedding = textToEmbedding(`${workspaceKey} ${sequenceKey}`);
          coll.insertSync([{ id: `doc_${sequences[sequences.length - 1].id}`, vectors: { embedding } }]);
        }
      } catch {
      }

      if (successRate > 0.7) {
        console.log(`[openlearn] 📝 Learned sequence: "${sequenceKey}" (${(successRate * 100).toFixed(0)}% success in ${workspaceKey})`);
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
        const lessons = loadLessons();
        const existing = lessons.find(
          l => l.errorSemantic === sanitizeError(pendingFailure.error).substring(0, 200)
        );

        if (existing) {
          existing.triggerCount++;
          existing.confidence = Math.min(0.95, existing.confidence + 0.05);
          existing.lastAccessed = new Date().toISOString();
          if (existing.unresolvedCount && existing.unresolvedCount > 0) {
            console.log(`[openlearn] ✅ Lesson resolved after ${existing.unresolvedCount} failures: "${existing.constraint}"`);
            existing.unresolvedCount = 0;
          }
        }

        saveLessons(lessons);
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

    const lessons = loadLessons();
    const errorEmbedding = textToEmbedding(`${toolName} ${sanitizedError}`);

    const existingLesson = lessons.find(
      l => l.errorSemantic.substring(0, 200) === sanitizedError.substring(0, 200) &&
           (l.workspacePattern === "*" || currentWorkspace.includes(l.workspacePattern))
    );

    if (existingLesson) {
      existingLesson.triggerCount++;
      existingLesson.confidence = Math.min(0.95, existingLesson.confidence + 0.1);
      existingLesson.lastAccessed = new Date().toISOString();
      existingLesson.unresolvedCount = 0;
      saveLessons(lessons);
      pendingFailure = null;
      return;
    }

    const newLesson = createLessonFromFailure(currentFailure);

    if (newLesson.constraint === "Analyze error message and adjust approach") {
      storeUnresolvedError(currentFailure, errorEmbedding);
      newLesson.unresolvedCount = 1;
    }

    lessons.push(newLesson);
    saveLessons(lessons);

    try {
      const coll = initLessonsZvec();
      if (coll) {
        coll.insertSync([{ id: `doc_${newLesson.id}`, vectors: { embedding: errorEmbedding } }]);
        newLesson.vectorId = 1;
      }
    } catch (e) {
      console.log(`[openlearn] ZVec not available: ${e}`);
    }

    console.log(`[openlearn] 📚 New lesson stored: ${newLesson.id} - "${newLesson.constraint}"`);
    pendingFailure = null;
  };

  const chatMessageHook = async (
    input: { sessionID: string; agent?: string; cwd?: string },
    output: { message: Record<string, unknown>; parts: Array<{ type: string; text?: string }> }
  ) => {
    if (input.cwd) {
      currentWorkspace = extractWorkspace(input.cwd);
    }

    if (!currentTool) return;

    const lessons = loadLessons();
    const sequences = loadSequences();
    const conventions = loadConventions();

    let relevantLessons: Lesson[] = [];
    let relevantSequences: ToolSequence[] = [];
    let relevantConventions: WorkspaceConvention[] = [];

    const coll = initLessonsZvec();
    const seqColl = initSequencesZvec();
    const convColl = initConventionsZvec();

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
        .sort((a, b) => (b.confidence * b.triggerCount) - (a.confidence * a.triggerCount))
        .slice(0, 3);
    }

    try {
      if (seqColl) {
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
      if (convColl) {
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
      const firstTextPart = output.parts.find(p => p.type === "text");
      if (firstTextPart?.text) {
        firstTextPart.text = contextBlock + firstTextPart.text;
      }
    }
  };

  const chatParamsHook = async (
    input: { sessionID: string; agent?: string },
    output: { temperature?: number; topP?: number; topK?: number; options: Record<string, unknown> }
  ) => {
    const lessons = loadLessons();
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

    const lessons = loadLessons();
    const sequences = loadSequences();

    let relevantLessons: Lesson[] = [];
    let relevantSequences: ToolSequence[] = [];

    const coll = initLessonsZvec();
    const seqColl = initSequencesZvec();

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
      if (seqColl) {
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
      console.log(`[openlearn] 🔗 Sequence detected: "${seq.tools.join(" → ")}" started`);
    }

    if (relevantLessons.length > 0) {
      const warnings = relevantLessons
        .filter(l => l.confidence > 0.5)
        .map((l, i) => `⚠️ ${l.constraint}`)
        .join("\n");
      if (warnings) {
        console.log(`[openlearn] Tool ${currentTool}:\n${warnings}`);
      }
    }
  };

  const eventHook = async (input: { event: { type: string; properties?: Record<string, unknown> } }) => {
    const event = input.event;
    if (event.type === "session.created") {
      const props = event.properties as { cwd?: string } | undefined;
      if (props?.cwd) {
        currentWorkspace = extractWorkspace(props.cwd);
      }
      toolSequence = [];
      console.log(`[openlearn] Session started in workspace: ${currentWorkspace}`);

      const unresolved = loadUnresolved();
      if (unresolved.length > 0) {
        console.log(`[openlearn] 📊 ${unresolved.length} unresolved error(s) from previous sessions`);
      }
    }

    if (event.type === "session.deleted") {
      if (toolSequenceTimer) clearTimeout(toolSequenceTimer);
      flushSequence();
    }
  };

  return {
    "tool.execute.before": toolExecuteBeforeHook,
    "tool.execute.after": toolExecuteAfterHook,
    "chat.message": chatMessageHook,
    "chat.params": chatParamsHook,
    event: eventHook,
  };
};

export default OpenLearnPlugin;