import path from "path";
import fs from "fs";
import { ZVecCollectionSchema, ZVecCreate and Open, ZVecDataType, ZVecDoc } from "@zvec/zvec";

export const DATA_DIR = path.join(process.env.HOME || "/root", ".openlearn");
export const DB_PATH = path.join(DATA_DIR, "lessons.json");
export const PENDING_PATH = path.join(DATA_DIR, "pending.json");
export const CONFIG_PATH = path.join(DATA_DIR, "config.json");
export const AUDIT_PATH = path.join(DATA_DIR, "audit.json");
export const HISTORY_PATH = path.join(DATA_DIR, "history.json");
export const ZVEC_PATH = path.join(DATA_DIR, "lessons.zvec");
export const SEQ_ZVEC_PATH = path.join(DATA_DIR, "sequences.zvec");
export const CONV_ZVEC_PATH = path.join(DATA_DIR, "conventions.zvec");
export const UNRESOLVED_PATH = path.join(DATA_DIR, "unresolved.json");
export const AUTO_INJECT_THRESHOLD = 0.7;

export type LearningMode = "full" | "suggest" | "off";

export interface Lesson {
  id: string;
  tool: string;
  workspacePattern: string;
  errorSemantic: string;
  constraint: string;
  successIndicator?: string;
  confidence: number;
  triggerCount: number;
  status: "active" | "pending";
  createdAt: string;
  lastRetrieved?: string;
  lastAccessed?: string;
  vectorId?: number;
  unresolvedCount?: number;
}

export interface PendingLesson extends Omit<Lesson, "status" | "lastRetrieved" | "lastAccessed"> {}

export interface ToolSequence {
  id: string;
  tools: string[];
  workspacePattern: string;
  successRate: number;
  totalRuns: number;
  successfulRuns: number;
  createdAt: string;
  lastAccessed?: string;
}

export interface WorkspaceConvention {
  id: string;
  workspacePattern: string;
  conventionType: string;
  value: string;
  confidence: number;
  sampleCount: number;
  createdAt: string;
}

export interface UnresolvedError {
  id: string;
  tool: string;
  workspacePattern: string;
  errorEmbedding: number[];
  errorText: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
}

export interface Config {
  learningMode: LearningMode;
  autoInjectThreshold: number;
  confidenceDecay: boolean;
  showSequences: boolean;
  showConventions: boolean;
  halfLifeDays: number;
}

export interface AuditEntry {
  id: string;
  action: AuditAction;
  lessonId?: string;
  timestamp: string;
  details: string;
}

export type AuditAction = "created" | "approved" | "rejected" | "used" | "rolled_back" | "imported" | "cleared" | "updated";

export interface LessonHistoryEntry {
  version: number;
  constraint: string;
  confidence: number;
  changedAt: string;
  action: AuditAction;
}

export type LessonHistory = Record<string, LessonHistoryEntry[]>;

export type ChatResponse = {
  type: "text";
  text: string;
} | {
  type: "error";
  text: string;
};

export const DEFAULT_CONFIG: Config = {
  learningMode: "full",
  autoInjectThreshold: 0.7,
  confidenceDecay: true,
  showSequences: true,
  showConventions: true,
  halfLifeDays: 30
};

let lessonsCollection: ReturnType<typeof ZVecCreateAndOpen> | null = null;
let sequencesCollection: ReturnType<typeof ZVecCreateAndOpen> | null = null;
let conventionsCollection: ReturnType<typeof ZVecCreateAndOpen> | null = null;

export function initLessonsZvec() {
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
      if (fs.existsSync(ZVEC_PATH)) fs.rmSync(ZVEC_PATH);
      lessonsCollection = ZVecCreateAndOpen(ZVEC_PATH, schema);
    } catch {
      lessonsCollection = null;
    }
  }

  return lessonsCollection;
}

export function initSequencesZvec() {
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
      if (fs.existsSync(SEQ_ZVEC_PATH)) fs.rmSync(SEQ_ZVEC_PATH);
      sequencesCollection = ZVecCreateAndOpen(SEQ_ZVEC_PATH, schema);
    } catch {
      sequencesCollection = null;
    }
  }

  return sequencesCollection;
}

export function initConventionsZvec() {
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
      if (fs.existsSync(CONV_ZVEC_PATH)) fs.rmSync(CONV_ZVEC_PATH);
      conventionsCollection = ZVecCreateAndOpen(CONV_ZVEC_PATH, schema);
    } catch {
      conventionsCollection = null;
    }
  }

  return conventionsCollection;
}

export function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadConfig(): Config {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: Config) {
  ensureDataDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function loadAllLessons(): Lesson[] {
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

export function loadLessons(): Lesson[] {
  return loadAllLessons().filter(l => l.status === "active");
}

export function saveLessons(lessons: Lesson[]) {
  ensureDataDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(lessons, null, 2));
}

export function loadPending(): PendingLesson[] {
  ensureDataDir();
  if (!fs.existsSync(PENDING_PATH)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(PENDING_PATH, "utf-8"));
  } catch {
    return [];
  }
}

export function savePending(pending: PendingLesson[]) {
  ensureDataDir();
  fs.writeFileSync(PENDING_PATH, JSON.stringify(pending, null, 2));
}

export function loadSequences(): ToolSequence[] {
  const seqPath = DB_PATH.replace("lessons.json", "sequences.json");
  ensureDataDir();
  if (!fs.existsSync(seqPath)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(seqPath, "utf-8"));
  } catch {
    return [];
  }
}

export function saveSequences(sequences: ToolSequence[]) {
  const seqPath = DB_PATH.replace("lessons.json", "sequences.json");
  ensureDataDir();
  fs.writeFileSync(seqPath, JSON.stringify(sequences, null, 2));
}

export function loadConventions(): WorkspaceConvention[] {
  const convPath = DB_PATH.replace("lessons.json", "conventions.json");
  ensureDataDir();
  if (!fs.existsSync(convPath)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(convPath, "utf-8"));
  } catch {
    return [];
  }
}

export function saveConventions(conventions: WorkspaceConvention[]) {
  const convPath = DB_PATH.replace("lessons.json", "conventions.json");
  ensureDataDir();
  fs.writeFileSync(convPath, JSON.stringify(conventions, null, 2));
}

export function loadUnresolved(): UnresolvedError[] {
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

export function saveUnresolved(unresolved: UnresolvedError[]) {
  ensureDataDir();
  fs.writeFileSync(UNRESOLVED_PATH, JSON.stringify(unresolved, null, 2));
}

export function loadAudit(): AuditEntry[] {
  ensureDataDir();
  if (!fs.existsSync(AUDIT_PATH)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(AUDIT_PATH, "utf-8"));
  } catch {
    return [];
  }
}

export function saveAudit(audit: AuditEntry[]) {
  ensureDataDir();
  fs.writeFileSync(AUDIT_PATH, JSON.stringify(audit, null, 2));
}

export function addAuditEntry(action: AuditAction, lessonId: string | undefined, details: string) {
  const audit = loadAudit();
  audit.push({
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    action,
    lessonId,
    timestamp: new Date().toISOString(),
    details
  });
  saveAudit(audit);
}

export function loadHistory(): LessonHistory {
  ensureDataDir();
  if (!fs.existsSync(HISTORY_PATH)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf-8"));
  } catch {
    return {};
  }
}

export function saveHistory(history: LessonHistory) {
  ensureDataDir();
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

export function addHistoryEntry(lessonId: string, entry: Omit<LessonHistoryEntry, "version">) {
  const history = loadHistory();
  if (!history[lessonId]) {
    history[lessonId] = [];
  }
  const version = history[lessonId].length + 1;
  history[lessonId].push({ ...entry, version });
  saveHistory(history);
}

export function generateLessonId(): string {
  return `lesson_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function generateSequenceId(): string {
  return `seq_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function generateConventionId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function sanitizeError(error: string): string {
  return error
    .replace(/\d+\.\d+\.\d+\.\d+/g, "<IP>")
    .replace(/0x[0-9a-fA-F]+/g, "<HEX>")
    .replace(/\/home\/[^\/]+/g, "/home/<USER>")
    .replace(/\/Users\/[^\/]+/g, "/Users/<USER>")
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "<API_KEY>");
}

export function extractWorkspace(cwd: string | undefined): string {
  if (!cwd) return "unknown";
  const parts = cwd.split("/");
  if (parts.length >= 3 && parts[2] === "Users") {
    return `~/.../${parts[parts.length - 1]}`;
  }
  return cwd;
}

export function textToEmbedding(text: string): number[] {
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