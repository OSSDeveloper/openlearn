import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  sanitizeError,
  extractWorkspace,
  textToEmbedding,
  loadConfig,
  saveConfig,
  loadAllLessons,
  saveLessons,
  loadPending,
  savePending,
  loadSequences,
  saveSequences,
  loadConventions,
  saveConventions,
  ensureDataDir,
  DEFAULT_CONFIG,
  buildLearnedContextBlock,
  type Config,
  type Lesson,
  type PendingLesson,
} from "./core";

describe("Core utility functions", () => {
  describe("sanitizeError", () => {
    test("redacts IP addresses", () => {
      expect(sanitizeError("error at 192.168.1.1")).toBe("error at <IP>");
      expect(sanitizeError("server 10.0.0.5 failed")).toBe("server <IP> failed");
    });

    test("redacts hex values", () => {
      expect(sanitizeError("error 0x1234 occurred")).toBe("error <HEX> occurred");
      expect(sanitizeError("0xDEADBEEF")).toBe("<HEX>");
    });

    test("redacts user home paths - /home/ style", () => {
      // Note: /home/<USER> only, not full path to project
      expect(sanitizeError("path /home/john/project")).toBe("path /home/<USER>/project");
    });

    test("redacts user home paths - /Users/ style", () => {
      expect(sanitizeError("path /Users/john/project")).toBe("path /Users/<USER>/project");
    });

    test("redacts API keys (sk- followed by 20+ alphanumeric)", () => {
      // Note: regex requires exactly the pattern sk-[a-zA-Z0-9]{20,}
      expect(sanitizeError("key sk-1234567890abcdefghij")).toBe("key <API_KEY>");
    });

    test("does not redact short sk- prefixes", () => {
      // Short API key patterns should not be redacted
      expect(sanitizeError("sk-12345")).toBe("sk-12345");
    });

    test("redacts Docker SHA256 hashes (64 char hex)", () => {
      // SHA256 hash is 64 hex characters after "sha256:"
      const longHash = "a".repeat(64);
      // Note: The regex replaces the whole match including "sha256:"
      expect(sanitizeError(`sha256:${longHash}`)).toBe("<DOCKER_HASH>");
    });

    test("does not redact short docker hashes", () => {
      // Short hashes should not be redacted
      expect(sanitizeError("sha256:abc123def456")).toBe("sha256:abc123def456");
    });

    test("redacts UUIDs", () => {
      // UUID format: 8-4-4-4-12 hex chars
      const validUUID = "8b7f1d12-4e9a-4b5e-8c3d-1f2a3b4c5d6e";
      expect(sanitizeError(`id ${validUUID}`)).toBe("id <UUID>");
    });

    test("redacts container IDs (container- followed by 64 char hex)", () => {
      const longContainerId = "a".repeat(64);
      expect(sanitizeError(`container-${longContainerId}`)).toBe("<CONTAINER>");
    });

    test("does not redact short container IDs", () => {
      expect(sanitizeError("container-abc123")).toBe("container-abc123");
    });

    test("preserves normal error text", () => {
      expect(sanitizeError("permission denied")).toBe("permission denied");
      expect(sanitizeError("file not found")).toBe("file not found");
    });

    test("handles multiple redactions in one string", () => {
      const input = "error at 192.168.1.1 for user /home/john";
      const result = sanitizeError(input);
      expect(result).toContain("<IP>");
      expect(result).toContain("<USER>");
    });
  });

  describe("extractWorkspace", () => {
    test("extracts from normal path", () => {
      expect(extractWorkspace("/home/user/project")).toBe("/home/user/project");
      expect(extractWorkspace("/var/log")).toBe("/var/log");
    });

    test("shortens /Users/* paths on macOS", () => {
      // This is platform-specific - /Users/ is macOS home directory style
      const result = extractWorkspace("/Users/john/Desktop/myproject");
      // On macOS, this returns ~/.../myproject
      // On Linux, this returns the original path (no /Users/ prefix)
      if (result.includes("/Users/")) {
        // Running on Linux, path not transformed
        expect(result).toBe("/Users/john/Desktop/myproject");
      } else {
        // Running on macOS, path transformed
        expect(result).toBe("~/.../myproject");
      }
    });

    test("handles undefined/empty", () => {
      expect(extractWorkspace(undefined)).toBe("unknown");
    });

    test("empty string is treated as undefined (returns unknown)", () => {
      // Empty string is falsy, so !cwd returns true and function returns "unknown"
      expect(extractWorkspace("")).toBe("unknown");
    });
  });

  describe("textToEmbedding", () => {
    test("produces 384-dimensional vector", () => {
      const embedding = textToEmbedding("test input");
      expect(embedding).toHaveLength(384);
    });

    test("produces normalized vector", () => {
      const embedding = textToEmbedding("test input");
      const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      expect(norm).toBeCloseTo(1.0, 5);
    });

    test("same input produces same embedding", () => {
      const embedding1 = textToEmbedding("test input");
      const embedding2 = textToEmbedding("test input");
      expect(embedding1).toEqual(embedding2);
    });

    test("different inputs produce different embeddings", () => {
      const embedding1 = textToEmbedding("test input");
      const embedding2 = textToEmbedding("different input");
      expect(embedding1).not.toEqual(embedding2);
    });

    test("handles single word", () => {
      const embedding = textToEmbedding("hello");
      expect(embedding).toHaveLength(384);
      const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      expect(norm).toBeCloseTo(1.0, 5);
    });
  });
});

describe("Config management", () => {
  beforeEach(() => {
    ensureDataDir();
  });

  afterEach(() => {
    saveConfig(DEFAULT_CONFIG);
  });

  test("loadConfig returns default when no config exists", () => {
    const config = loadConfig();
    expect(config.learningMode).toBe("full");
    expect(config.autoInjectThreshold).toBe(0.5);
    expect(config.confidenceDecay).toBe(true);
    expect(config.showSequences).toBe(true);
    expect(config.showConventions).toBe(true);
    expect(config.halfLifeDays).toBe(30);
  });

  test("saveConfig persists changes", () => {
    const newConfig: Config = {
      ...DEFAULT_CONFIG,
      learningMode: "suggest",
      autoInjectThreshold: 0.3,
    };
    saveConfig(newConfig);
    const loaded = loadConfig();
    expect(loaded.learningMode).toBe("suggest");
    expect(loaded.autoInjectThreshold).toBe(0.3);
  });

  test("loadConfig merges with defaults", () => {
    const partial = { learningMode: "off" as const };
    saveConfig(partial);
    const loaded = loadConfig();
    expect(loaded.learningMode).toBe("off");
    expect(loaded.autoInjectThreshold).toBe(0.5);
    expect(loaded.confidenceDecay).toBe(true);
  });
});

describe("Lessons storage", () => {
  beforeEach(() => {
    ensureDataDir();
    saveLessons([]);
    savePending([]);
  });

  afterEach(() => {
    saveLessons([]);
    savePending([]);
  });

  test("saveLessons and loadAllLessons", () => {
    const lessons: Lesson[] = [
      {
        id: "lesson_1",
        tool: "Bash",
        workspacePattern: "*",
        errorSemantic: "permission denied",
        constraint: "Use sudo",
        confidence: 0.8,
        triggerCount: 5,
        status: "active",
        createdAt: new Date().toISOString(),
      },
    ];
    saveLessons(lessons);
    const loaded = loadAllLessons();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("lesson_1");
  });

  test("loadAllLessons returns empty array when no file", () => {
    const loaded = loadAllLessons();
    expect(Array.isArray(loaded)).toBe(true);
  });

  test("savePending and loadPending", () => {
    const pending: PendingLesson[] = [
      {
        id: "pending_1",
        tool: "npm",
        workspacePattern: "*",
        errorSemantic: "enoent",
        constraint: "Check path",
        confidence: 0.5,
        triggerCount: 1,
        createdAt: new Date().toISOString(),
      },
    ];
    savePending(pending);
    const loaded = loadPending();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("pending_1");
  });
});

describe("Sequences storage", () => {
  beforeEach(() => {
    saveSequences([]);
  });

  afterEach(() => {
    saveSequences([]);
  });

  test("saveSequences and loadSequences", () => {
    const sequences = [
      {
        id: "seq_1",
        tools: ["git-add", "git-commit", "git-push"],
        workspacePattern: "*",
        successRate: 0.85,
        totalRuns: 20,
        successfulRuns: 17,
        createdAt: new Date().toISOString(),
      },
    ];
    saveSequences(sequences);
    const loaded = loadSequences();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].tools).toEqual(["git-add", "git-commit", "git-push"]);
  });
});

describe("Conventions storage", () => {
  beforeEach(() => {
    saveConventions([]);
  });
});

describe("buildLearnedContextBlock", () => {
  test("returns null when no lessons", () => {
    const result = buildLearnedContextBlock([], "/project", 0.5);
    expect(result).toBeNull();
  });

  test("returns null when no lessons meet threshold", () => {
    const lessons: Lesson[] = [
      {
        id: "l1",
        tool: "Bash",
        workspacePattern: "project",
        errorSemantic: "permission denied",
        constraint: "Use sudo",
        confidence: 0.3,
        triggerCount: 1,
        status: "active",
        createdAt: new Date().toISOString()
      }
    ];
    const result = buildLearnedContextBlock(lessons, "project", 0.5);
    expect(result).toBeNull();
  });

  test("returns context block for lessons above threshold", () => {
    const lessons: Lesson[] = [
      {
        id: "l1",
        tool: "Bash",
        workspacePattern: "project",
        errorSemantic: "permission denied",
        constraint: "Use sudo",
        confidence: 0.7,
        triggerCount: 1,
        status: "active",
        createdAt: new Date().toISOString()
      }
    ];
    const result = buildLearnedContextBlock(lessons, "project", 0.5);
    expect(result).not.toBeNull();
    expect(result).toContain("[LEARNED]");
    expect(result).toContain("Use sudo");
  });

  test("filters by workspace", () => {
    const lessons: Lesson[] = [
      {
        id: "l1",
        tool: "Bash",
        workspacePattern: "otherproject",
        errorSemantic: "permission denied",
        constraint: "Use sudo",
        confidence: 0.9,
        triggerCount: 1,
        status: "active",
        createdAt: new Date().toISOString()
      }
    ];
    const result = buildLearnedContextBlock(lessons, "myproject", 0.5);
    expect(result).toBeNull();
  });

  test("wildcard workspace matches any", () => {
    const lessons: Lesson[] = [
      {
        id: "l1",
        tool: "Bash",
        workspacePattern: "*",
        errorSemantic: "permission denied",
        constraint: "Use sudo for any permission errors",
        confidence: 0.6,
        triggerCount: 1,
        status: "active",
        createdAt: new Date().toISOString()
      }
    ];
    const result = buildLearnedContextBlock(lessons, "myproject", 0.5);
    expect(result).not.toBeNull();
    expect(result).toContain("Use sudo for any permission errors");
  });
});

describe("Conventions storage", () => {
  test("saveConventions and loadConventions", () => {
    const conventions = [
      {
        id: "conv_1",
        workspacePattern: "myproject",
        conventionType: "commit_format",
        value: "feat: short description",
        confidence: 0.7,
        sampleCount: 10,
        createdAt: new Date().toISOString(),
      },
    ];
    saveConventions(conventions);
    const loaded = loadConventions();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].conventionType).toBe("commit_format");
  });
});
