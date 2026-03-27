import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  OpenLearnPlugin,
} from "./plugin";
import {
  saveLessons,
  savePending,
  saveConfig,
  saveSequences,
  saveConventions,
  loadAllLessons,
  loadPending,
  loadConfig,
  DEFAULT_CONFIG,
} from "./core";
import * as fs from "fs";
import * as path from "path";

// The plugin stores data in ~/.openlearn (HOME directory)
const HOME_DATA_DIR = path.join(process.env.HOME || "/root", ".openlearn");

function cleanDataDir() {
  if (fs.existsSync(HOME_DATA_DIR)) {
    const files = [
      "lessons.json",
      "pending.json",
      "config.json",
      "sequences.json",
      "conventions.json",
      "audit.json",
      "history.json",
      "unresolved.json",
    ];
    for (const file of files) {
      const filePath = path.join(HOME_DATA_DIR, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }
}

function createMockPluginContext() {
  return {
    client: {},
    project: { id: "test-project" },
    directory: "/tmp",
    worktree: "",
    serverUrl: new URL("http://localhost:4096"),
    $: {},
  };
}

async function createTestHooks() {
  const ctx = createMockPluginContext();
  return await OpenLearnPlugin(ctx);
}

describe("OpenLearnPlugin initialization", () => {
  test("plugin is a function", () => {
    expect(typeof OpenLearnPlugin).toBe("function");
  });

  test("plugin returns promise that resolves to hooks object", async () => {
    const ctx = createMockPluginContext();
    const pluginPromise = OpenLearnPlugin(ctx);
    expect(pluginPromise).toBeInstanceOf(Promise);
    
    const hooks = await pluginPromise;
    expect(typeof hooks).toBe("object");
    expect(hooks).not.toBeNull();
  });

  test("plugin returns all expected hooks", async () => {
    const hooks = await createTestHooks();
    
    const hookNames = Object.keys(hooks);
    expect(hookNames).toContain("name");
    expect(hookNames).toContain("tool.execute.after");
    expect(hookNames).toContain("tool.execute.before");
    expect(hookNames).toContain("chat.message");
    expect(hookNames).toContain("chat.params");
    expect(hookNames).toContain("event");
  });

  test("plugin name is openlearn", async () => {
    const hooks = await createTestHooks();
    expect(hooks.name).toBe("openlearn");
  });
});

describe("tool.execute.before hook", () => {
  test("processes without error for valid input", async () => {
    const hooks = await createTestHooks();
    
    const input = { tool: "Bash", sessionID: "sess-1", callID: "call-1" };
    const output = { args: { command: "ls -la", cwd: "/tmp" } };

    await hooks["tool.execute.before"]!(input, output);
    expect(true).toBe(true);
  });

  test("handles empty args", async () => {
    const hooks = await createTestHooks();
    
    const input = { tool: "Bash", sessionID: "sess-1", callID: "call-1" };
    const output = { args: {} };

    await hooks["tool.execute.before"]!(input, output);
    expect(true).toBe(true);
  });

  test("handles undefined args", async () => {
    const hooks = await createTestHooks();
    
    const input = { tool: "Bash", sessionID: "sess-1", callID: "call-1" };
    const output = { args: undefined as any };

    await hooks["tool.execute.before"]!(input, output);
    expect(true).toBe(true);
  });

  test("handles missing cwd in args", async () => {
    const hooks = await createTestHooks();
    
    const input = { tool: "Bash", sessionID: "sess-1", callID: "call-1" };
    const output = { args: { command: "ls" } };

    await hooks["tool.execute.before"]!(input, output);
    expect(true).toBe(true);
  });
});

describe("tool.execute.after hook - MCP tool results", () => {
  beforeEach(() => {
    cleanDataDir();
  });

  afterEach(() => {
    cleanDataDir();
  });

  // MCP tools return results with 'content' array: { content: [{ type: "text", text: "..." }] }
  // This is the format used by Model Context Protocol tools

  test("detects error in MCP content array (single text block)", async () => {
    const hooks = await createTestHooks();
    
    const beforeInput = { tool: "Bash", sessionID: "sess-1", callID: "call-1" };
    const beforeOutput = { args: { command: "docker build .", cwd: "/tmp/project" } };
    await hooks["tool.execute.before"]!(beforeInput, beforeOutput);

    const afterInput = {
      tool: "Bash",
      sessionID: "sess-1",
      callID: "call-1",
      args: { command: "docker build ." },
    };

    // MCP tool result format - content array with text blocks
    const afterOutput = {
      content: [
        { type: "text", text: "docker: permission denied while trying to connect to the Docker daemon socket" },
      ],
    };

    await hooks["tool.execute.after"]!(afterInput, afterOutput);

    const lessons = loadAllLessons();
    const pending = loadPending();
    expect(lessons.length + pending.length).toBeGreaterThan(0);
    
    const allCreated = [...lessons, ...pending];
    const permDeniedLesson = allCreated.find(l => 
      l.constraint.includes("sudo or check file permissions")
    );
    expect(permDeniedLesson).toBeDefined();
  });

  test("detects 'no such file' error in MCP content array", async () => {
    const hooks = await createTestHooks();
    
    const beforeInput = { tool: "Read", sessionID: "sess-1", callID: "call-1" };
    const beforeOutput = { args: { file_path: "/nonexistent.txt" } };
    await hooks["tool.execute.before"]!(beforeInput, beforeOutput);

    const afterInput = {
      tool: "Read",
      sessionID: "sess-1",
      callID: "call-1",
      args: { file_path: "/nonexistent.txt" },
    };

    const afterOutput = {
      content: [{ type: "text", text: "Error: /nonexistent.txt: No such file or directory" }],
    };

    await hooks["tool.execute.after"]!(afterInput, afterOutput);

    const lessons = loadAllLessons();
    const pending = loadPending();
    expect(lessons.length + pending.length).toBeGreaterThan(0);
  });

  test("detects error across multiple text blocks in MCP content", async () => {
    const hooks = await createTestHooks();
    
    const beforeInput = { tool: "Bash", sessionID: "sess-1", callID: "call-1" };
    const beforeOutput = { args: { command: "npm install" } };
    await hooks["tool.execute.before"]!(beforeInput, beforeOutput);

    const afterInput = {
      tool: "Bash",
      sessionID: "sess-1",
      callID: "call-1",
      args: { command: "npm install" },
    };

    // Multiple text blocks - error detection should work across them
    const afterOutput = {
      content: [
        { type: "text", text: "npm error code ENOENT" },
        { type: "text", text: "npm error path /some/path" },
        { type: "text", text: "npm error syscall open" },
      ],
    };

    await hooks["tool.execute.after"]!(afterInput, afterOutput);

    const lessons = loadAllLessons();
    const pending = loadPending();
    expect(lessons.length + pending.length).toBeGreaterThan(0);
  });

  test("successful MCP output does not create lesson", async () => {
    const hooks = await createTestHooks();
    
    const beforeInput = { tool: "Read", sessionID: "sess-1", callID: "call-1" };
    const beforeOutput = { args: { file_path: "/tmp/existing.txt" } };
    await hooks["tool.execute.before"]!(beforeInput, beforeOutput);

    const afterInput = {
      tool: "Read",
      sessionID: "sess-1",
      callID: "call-1",
      args: { file_path: "/tmp/existing.txt" },
    };

    const afterOutput = {
      content: [{ type: "text", text: "File contents here..." }],
    };

    const lessonsBefore = loadAllLessons().length;
    await hooks["tool.execute.after"]!(afterInput, afterOutput);
    const lessonsAfter = loadAllLessons().length;

    expect(lessonsAfter).toBe(lessonsBefore);
  });
});

describe("tool.execute.after hook - Native tool results", () => {
  beforeEach(() => {
    cleanDataDir();
  });

  afterEach(() => {
    cleanDataDir();
  });

  // Native OpenCode tools return: { output: "string", title: "string", metadata: {...} }
  // Some native tools use 'result' property instead of 'output'

  test("detects error in output string property (native format)", async () => {
    const hooks = await createTestHooks();
    
    const beforeInput = { tool: "Bash", sessionID: "sess-1", callID: "call-1" };
    const beforeOutput = { args: { command: "ls /nonexistent" } };
    await hooks["tool.execute.before"]!(beforeInput, beforeOutput);

    const afterInput = {
      tool: "Bash",
      sessionID: "sess-1",
      callID: "call-1",
      args: { command: "ls /nonexistent" },
    };

    // Native tool result format - direct output string
    const afterOutput = {
      output: "ls: /nonexistent: No such file or directory",
    };

    await hooks["tool.execute.after"]!(afterInput, afterOutput);

    const lessons = loadAllLessons();
    const pending = loadPending();
    expect(lessons.length + pending.length).toBeGreaterThan(0);
  });

  test("detects error in result string property", async () => {
    const hooks = await createTestHooks();
    
    const beforeInput = { tool: "Bash", sessionID: "sess-1", callID: "call-1" };
    const beforeOutput = { args: { command: "docker run" } };
    await hooks["tool.execute.before"]!(beforeInput, beforeOutput);

    const afterInput = {
      tool: "Bash",
      sessionID: "sess-1",
      callID: "call-1",
      args: { command: "docker run" },
    };

    // Some native tools use 'result' instead of 'output'
    const afterOutput = {
      result: "Error: permission denied while trying to connect to Docker daemon",
    };

    await hooks["tool.execute.after"]!(afterInput, afterOutput);

    const lessons = loadAllLessons();
    const pending = loadPending();
    expect(lessons.length + pending.length).toBeGreaterThan(0);
  });

  test("successful output string does not create lesson", async () => {
    const hooks = await createTestHooks();
    
    const beforeInput = { tool: "Bash", sessionID: "sess-1", callID: "call-1" };
    const beforeOutput = { args: { command: "ls -la" } };
    await hooks["tool.execute.before"]!(beforeInput, beforeOutput);

    const afterInput = {
      tool: "Bash",
      sessionID: "sess-1",
      callID: "call-1",
      args: { command: "ls -la" },
    };

    const afterOutput = {
      output: "total 8\ndrwxr-xr-x 2 user staff 96 Mar 26 file.txt",
    };

    const lessonsBefore = loadAllLessons().length;
    await hooks["tool.execute.after"]!(afterInput, afterOutput);
    const lessonsAfter = loadAllLessons().length;

    expect(lessonsAfter).toBe(lessonsBefore);
  });
});

describe("tool.execute.after hook - Learning modes", () => {
  beforeEach(() => {
    cleanDataDir();
  });

  afterEach(() => {
    cleanDataDir();
  });

  test("learning mode 'off' does not create lessons", async () => {
    saveConfig({ ...DEFAULT_CONFIG, learningMode: "off" });
    const hooks = await createTestHooks();

    const beforeInput = { tool: "Bash", sessionID: "sess-1", callID: "call-1" };
    const beforeOutput = { args: { command: "docker build .", cwd: "/tmp" } };
    await hooks["tool.execute.before"]!(beforeInput, beforeOutput);

    const afterInput = {
      tool: "Bash",
      sessionID: "sess-1",
      callID: "call-1",
      args: { command: "docker build ." },
    };
    const afterOutput = {
      content: [{ type: "text", text: "permission denied" }],
    };

    await hooks["tool.execute.after"]!(afterInput, afterOutput);

    const lessons = loadAllLessons();
    expect(lessons.length).toBe(0);
    
    saveConfig(DEFAULT_CONFIG);
  });

  test("learning mode 'suggest' creates pending lessons", async () => {
    saveConfig({ ...DEFAULT_CONFIG, learningMode: "suggest" });
    const hooks = await createTestHooks();

    const beforeInput = { tool: "Bash", sessionID: "sess-1", callID: "call-1" };
    const beforeOutput = { args: { command: "docker build .", cwd: "/tmp" } };
    await hooks["tool.execute.before"]!(beforeInput, beforeOutput);

    const afterInput = {
      tool: "Bash",
      sessionID: "sess-1",
      callID: "call-1",
      args: { command: "docker build ." },
    };
    const afterOutput = {
      content: [{ type: "text", text: "permission denied" }],
    };

    await hooks["tool.execute.after"]!(afterInput, afterOutput);

    const lessons = loadAllLessons();
    const pending = loadPending();
    expect(lessons.length).toBe(0);
    expect(pending.length).toBeGreaterThan(0);
    
    saveConfig(DEFAULT_CONFIG);
  });

  test("learning mode 'full' creates active lessons directly", async () => {
    saveConfig({ ...DEFAULT_CONFIG, learningMode: "full" });
    const hooks = await createTestHooks();

    const beforeInput = { tool: "Bash", sessionID: "sess-1", callID: "call-1" };
    const beforeOutput = { args: { command: "docker build .", cwd: "/tmp" } };
    await hooks["tool.execute.before"]!(beforeInput, beforeOutput);

    const afterInput = {
      tool: "Bash",
      sessionID: "sess-1",
      callID: "call-1",
      args: { command: "docker build ." },
    };
    const afterOutput = {
      content: [{ type: "text", text: "permission denied" }],
    };

    await hooks["tool.execute.after"]!(afterInput, afterOutput);

    const lessons = loadAllLessons();
    const pending = loadPending();
    expect(lessons.length).toBeGreaterThan(0);
    expect(pending.length).toBe(0);
    
    saveConfig(DEFAULT_CONFIG);
  });

  test("increments triggerCount for repeated error", async () => {
    saveConfig({ ...DEFAULT_CONFIG, learningMode: "full" });
    
    // Create first lesson
    const hooks1 = await createTestHooks();
    const beforeInput1 = { tool: "Bash", sessionID: "sess-1", callID: "call-1" };
    const beforeOutput1 = { args: { command: "docker build .", cwd: "/tmp" } };
    await hooks1["tool.execute.before"]!(beforeInput1, beforeOutput1);

    const afterInput1 = {
      tool: "Bash",
      sessionID: "sess-1",
      callID: "call-1",
      args: { command: "docker build ." },
    };
    const afterOutput1 = {
      content: [{ type: "text", text: "permission denied" }],
    };
    await hooks1["tool.execute.after"]!(afterInput1, afterOutput1);

    let lessons = loadAllLessons();
    const initialTriggers = lessons[0].triggerCount;

    // Create second lesson with same error
    const hooks2 = await createTestHooks();
    const beforeInput2 = { tool: "Bash", sessionID: "sess-2", callID: "call-2" };
    const beforeOutput2 = { args: { command: "docker build .", cwd: "/tmp" } };
    await hooks2["tool.execute.before"]!(beforeInput2, beforeOutput2);

    const afterInput2 = {
      tool: "Bash",
      sessionID: "sess-2",
      callID: "call-2",
      args: { command: "docker build ." },
    };
    const afterOutput2 = {
      content: [{ type: "text", text: "permission denied" }],
    };
    await hooks2["tool.execute.after"]!(afterInput2, afterOutput2);

    lessons = loadAllLessons();
    expect(lessons[0].triggerCount).toBeGreaterThan(initialTriggers);
    
    saveConfig(DEFAULT_CONFIG);
  });
});

describe("tool.execute.after hook - Error types", () => {
  beforeEach(() => {
    cleanDataDir();
  });

  afterEach(() => {
    cleanDataDir();
  });

  test("detects 'permission denied' error", async () => {
    const hooks = await createTestHooks();
    
    const beforeInput = { tool: "Bash", sessionID: "sess-1", callID: "call-1" };
    const beforeOutput = { args: { command: "docker ps" } };
    await hooks["tool.execute.before"]!(beforeInput, beforeOutput);

    const afterInput = {
      tool: "Bash",
      sessionID: "sess-1",
      callID: "call-1",
      args: { command: "docker ps" },
    };
    const afterOutput = {
      content: [{ type: "text", text: "permission denied" }],
    };

    await hooks["tool.execute.after"]!(afterInput, afterOutput);

    const lessons = loadAllLessons();
    const pending = loadPending();
    const allCreated = [...lessons, ...pending];
    const permLesson = allCreated.find(l => 
      l.constraint.includes("sudo or check file permissions")
    );
    expect(permLesson).toBeDefined();
  });

  test("detects 'no such file' error", async () => {
    const hooks = await createTestHooks();
    
    const beforeInput = { tool: "Bash", sessionID: "sess-1", callID: "call-1" };
    const beforeOutput = { args: { command: "cat /fake/path" } };
    await hooks["tool.execute.before"]!(beforeInput, beforeOutput);

    const afterInput = {
      tool: "Bash",
      sessionID: "sess-1",
      callID: "call-1",
      args: { command: "cat /fake/path" },
    };
    const afterOutput = {
      content: [{ type: "text", text: "cat: /fake/path: No such file or directory" }],
    };

    await hooks["tool.execute.after"]!(afterInput, afterOutput);

    const lessons = loadAllLessons();
    const pending = loadPending();
    const allCreated = [...lessons, ...pending];
    const fileLesson = allCreated.find(l => 
      l.constraint.includes("Verify file path")
    );
    expect(fileLesson).toBeDefined();
  });
});

describe("Full learning pipeline - Learn AND inject context", () => {
  // These tests verify the complete flow:
  // 1. Tool fails → Lesson learned (stored)
  // 2. Before next tool call → Relevant lesson injected as hint
  // 3. Chat message → Learned context injected

  beforeEach(() => {
    cleanDataDir();
  });

  afterEach(() => {
    cleanDataDir();
  });

  test("MCP tool error: learn → then inject context via chat.system.transform", async () => {
    // Step 1: MCP tool fails, lesson is learned
    const hooks1 = await createTestHooks();
    
    const beforeInput1 = { tool: "Bash", sessionID: "sess-1", callID: "call-1" };
    const beforeOutput1 = { args: { command: "docker build .", cwd: "/project" } };
    await hooks1["tool.execute.before"]!(beforeInput1, beforeOutput1);

    const afterInput1 = {
      tool: "Bash",
      sessionID: "sess-1",
      callID: "call-1",
      args: { command: "docker build ." },
    };
    const afterOutput1 = {
      content: [{ type: "text", text: "docker: permission denied" }],
    };
    await hooks1["tool.execute.after"]!(afterInput1, afterOutput1);

    // Verify lesson was created
    const lessons = loadAllLessons();
    expect(lessons.length).toBeGreaterThan(0);

    // Step 2: System prompt transform → learned context injected into system
    const hooks2 = await createTestHooks();
    
    const systemInput2 = { sessionID: "sess-2", model: { providerID: "openai", modelID: "gpt-4" } };
    const systemOutput2 = { system: ["You are a helpful assistant."] };
    
    await hooks2["experimental.chat.system.transform"]!(systemInput2, systemOutput2);
    
    // The system array should now contain learned context
    expect(systemOutput2.system.length).toBeGreaterThan(1);
    expect(systemOutput2.system[systemOutput2.system.length - 1]).toContain("[LEARNED]");
  });

  test("Native tool error: learn → then inject context via chat.system.transform", async () => {
    // Step 1: Native tool fails, lesson is learned
    const hooks1 = await createTestHooks();
    
    const beforeInput1 = { tool: "Bash", sessionID: "sess-1", callID: "call-1" };
    const beforeOutput1 = { args: { command: "ls /nonexistent", cwd: "/tmp" } };
    await hooks1["tool.execute.before"]!(beforeInput1, beforeOutput1);

    const afterInput1 = {
      tool: "Bash",
      sessionID: "sess-1",
      callID: "call-1",
      args: { command: "ls /nonexistent" },
    };
    const afterOutput1 = {
      output: "ls: /nonexistent: No such file or directory",
    };
    await hooks1["tool.execute.after"]!(afterInput1, afterOutput1);

    // Verify lesson was created
    const lessons = loadAllLessons();
    expect(lessons.length).toBeGreaterThan(0);

    // Step 2: System prompt transform → context injected
    const hooks2 = await createTestHooks();
    
    const systemInput2 = { sessionID: "sess-2", model: { providerID: "openai", modelID: "gpt-4" } };
    const systemOutput2 = { system: ["You are a helpful assistant."] };
    
    await hooks2["experimental.chat.system.transform"]!(systemInput2, systemOutput2);
    
    // The system array should contain learned context
    expect(systemOutput2.system.length).toBeGreaterThan(1);
    expect(systemOutput2.system[systemOutput2.system.length - 1]).toContain("[LEARNED]");
  });

  test("MCP tool: learn → then inject context via chat.system.transform", async () => {
    // Step 1: MCP tool fails
    const hooks1 = await createTestHooks();
    
    const beforeInput1 = { tool: "Bash", sessionID: "sess-1", callID: "call-1" };
    const beforeOutput1 = { args: { command: "npm install", cwd: "/project" } };
    await hooks1["tool.execute.before"]!(beforeInput1, beforeOutput1);

    const afterInput1 = {
      tool: "Bash",
      sessionID: "sess-1",
      callID: "call-1",
      args: { command: "npm install" },
    };
    const afterOutput1 = {
      content: [{ type: "text", text: "npm error code ENOENT" }],
    };
    await hooks1["tool.execute.after"]!(afterInput1, afterOutput1);

    // Step 2: System prompt transform → learnings injected
    const hooks2 = await createTestHooks();
    
    const systemInput = { sessionID: "sess-2", model: { providerID: "openai", modelID: "gpt-4" } };
    const systemOutput = { system: ["You are a helpful assistant."] };

    await hooks2["experimental.chat.system.transform"]!(systemInput, systemOutput);

    // The system should have learned context appended
    expect(systemOutput.system.length).toBeGreaterThan(1);
    expect(systemOutput.system[systemOutput.system.length - 1]).toContain("[LEARNED]");
  });

  test("Sequence detection: learned sequence info is NOT injected via tool.execute.before", async () => {
    // This test verifies that tool.execute.before does NOT have a hint mechanism
    // (OpenCode architecture doesn't support output.hint modification)
    // Sequence detection happens in chat.system.transform instead
    
    const hooks = await createTestHooks();
    
    const beforeInput = { tool: "Bash", sessionID: "sess-1", callID: "call-1" };
    const beforeOutput = { args: { command: "git status", cwd: "/project" } };
    
    await hooks["tool.execute.before"]!(beforeInput, beforeOutput);
    
    // tool.execute.before does NOT support output.hint - this is expected behavior
    expect(beforeOutput).not.toHaveProperty("hint");
  });
});

describe("chat.message hook", () => {
  test("help command returns help text", async () => {
    const hooks = await createTestHooks();
    
    const input = {
      sessionID: "sess-1",
      agent: "test-agent",
    };
    const output = {
      message: { role: "user" },
      parts: [{ type: "text", text: "openlearn: help" }],
    };

    await hooks["chat.message"]!(input, output);

    expect(output.parts[0].text).toContain("openlearn commands");
    expect(output.parts[0].text).toContain("openlearn: list");
    expect(output.parts[0].text).toContain("openlearn: review");
  });

  test("list command returns status", async () => {
    const hooks = await createTestHooks();
    
    const input = {
      sessionID: "sess-1",
      agent: "test-agent",
    };
    const output = {
      message: { role: "user" },
      parts: [{ type: "text", text: "openlearn: list" }],
    };

    await hooks["chat.message"]!(input, output);

    expect(output.parts[0].text).toContain("openlearn Status");
    expect(output.parts[0].text).toContain("Mode:");
  });

  test("list --all command returns all lessons (or empty state)", async () => {
    const hooks = await createTestHooks();
    
    const input = {
      sessionID: "sess-1",
      agent: "test-agent",
    };
    const output = {
      message: { role: "user" },
      parts: [{ type: "text", text: "openlearn: list --all" }],
    };

    await hooks["chat.message"]!(input, output);

    expect(
      output.parts[0].text.includes("All Lessons") ||
      output.parts[0].text.includes("No active lessons")
    ).toBe(true);
  });

  test("list --pending shows pending review or empty state", async () => {
    const hooks = await createTestHooks();
    
    const input = {
      sessionID: "sess-1",
      agent: "test-agent",
    };
    const output = {
      message: { role: "user" },
      parts: [{ type: "text", text: "openlearn: list --pending" }],
    };

    await hooks["chat.message"]!(input, output);

    expect(
      output.parts[0].text.includes("Pending Review") ||
      output.parts[0].text.includes("No pending lessons")
    ).toBe(true);
  });

  test("config command returns current config", async () => {
    const hooks = await createTestHooks();
    
    const input = {
      sessionID: "sess-1",
      agent: "test-agent",
    };
    const output = {
      message: { role: "user" },
      parts: [{ type: "text", text: "openlearn: config" }],
    };

    await hooks["chat.message"]!(input, output);

    expect(output.parts[0].text).toContain("Current Config");
    expect(output.parts[0].text).toContain("learningMode");
  });

  test("config --list returns config options", async () => {
    const hooks = await createTestHooks();
    
    const input = {
      sessionID: "sess-1",
      agent: "test-agent",
    };
    const output = {
      message: { role: "user" },
      parts: [{ type: "text", text: "openlearn: config --list" }],
    };

    await hooks["chat.message"]!(input, output);

    expect(output.parts[0].text).toContain("Config Options");
  });

  test("unknown command returns error", async () => {
    const hooks = await createTestHooks();
    
    const input = {
      sessionID: "sess-1",
      agent: "test-agent",
    };
    const output = {
      message: { role: "user" },
      parts: [{ type: "text", text: "openlearn: invalid_command" }],
    };

    await hooks["chat.message"]!(input, output);

    expect(output.parts[0].text).toContain("Unknown command");
  });

  test("non-openlearn messages are not modified", async () => {
    const hooks = await createTestHooks();
    
    const input = {
      sessionID: "sess-1",
      agent: "test-agent",
    };
    const output = {
      message: { role: "user" },
      parts: [{ type: "text", text: "Hello world" }],
    };

    const originalText = output.parts[0].text;
    await hooks["chat.message"]!(input, output);

    expect(output.parts[0].text).toBe(originalText);
  });
});

describe("event hook", () => {
  test("handles session.created event", async () => {
    const hooks = await createTestHooks();
    
    const input = {
      event: {
        type: "session.created",
        properties: {
          info: { id: "sess-123", title: "Test Session" },
        },
      },
    };

    await hooks["event"]!(input);
    expect(true).toBe(true);
  });

  test("handles session.deleted event", async () => {
    const hooks = await createTestHooks();
    
    const input = {
      event: {
        type: "session.deleted",
        properties: {
          info: { id: "sess-123" },
        },
      },
    };

    await hooks["event"]!(input);
    expect(true).toBe(true);
  });

  test("handles message.updated event", async () => {
    const hooks = await createTestHooks();
    
    const input = {
      event: {
        type: "message.updated",
        properties: {
          info: { id: "msg-123", sessionID: "sess-123" },
        },
      },
    };

    await hooks["event"]!(input);
    expect(true).toBe(true);
  });

  test("handles session.error event", async () => {
    const hooks = await createTestHooks();
    
    const input = {
      event: {
        type: "session.error",
        properties: {
          sessionID: "sess-123",
          error: "some error",
        },
      },
    };

    await hooks["event"]!(input);
    expect(true).toBe(true);
  });
});

describe("chat.params hook", () => {
  test("chat.params hook exists and can be called", async () => {
    const hooks = await createTestHooks();
    
    const input = {
      sessionID: "sess-1",
      agent: "test-agent",
      model: { providerID: "openai", modelID: "gpt-4" },
      provider: { id: "openai" } as any,
      message: { role: "user" },
    };
    const output = {
      temperature: 0.7,
      topP: 0.9,
      topK: 20,
      options: {} as Record<string, unknown>,
    };

    await hooks["chat.params"]!(input as any, output);
    expect(output.options).toBeDefined();
  });
});
