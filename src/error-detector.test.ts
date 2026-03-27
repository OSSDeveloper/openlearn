import { describe, test, expect } from "bun:test";
import { detectError, ErrorDetector } from "./error-detector";

describe("detectError", () => {
  test("detects isError flag set to true", () => {
    const result = { isError: true, content: [{ type: "text", text: "success" }] };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
    expect(detection.confidence).toBe(1.0);
    expect(detection.reason).toContain("isError flag");
  });

  test("detects isError flag as string 'true'", () => {
    const result = { isError: "true", content: [] };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
  });

  test("detects error in metadata", () => {
    const result = { metadata: { error: "Something went wrong" }, content: [] };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
    expect(detection.confidence).toBe(0.95);
    expect(detection.reason).toContain("metadata");
  });

  test("detects failed flag in metadata", () => {
    const result = { metadata: { failed: true }, content: [] };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
  });

  test("detects status error in metadata", () => {
    const result = { metadata: { status: "error" }, content: [] };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
  });

  test("detects 'permission denied' in text", () => {
    const result = { output: "Error: permission denied for file /path/to/file" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
    expect(detection.confidence).toBe(0.95);
    expect(detection.errorType).toBe("critical");
  });

  test("detects 'no such file' in text", () => {
    const result = { output: "ls: /Users/ossdeveloper/nonexistent/file.txt: No such file or directory" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
    expect(detection.confidence).toBe(0.95);
  });

  test("detects 'not found' in text", () => {
    const result = { output: "Resource not found at endpoint /api/users" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
  });

  test("detects 'does not exist' in text (MCP error pattern)", () => {
    const result = { output: "Parent directory does not exist: /Users/ossdeveloper/nonexistent" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
    expect(detection.confidence).toBe(0.95);
    expect(detection.reason).toContain("does not exist");
  });

  test("detects 'unable to' in text", () => {
    const result = { output: "Unable to connect to database" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
    expect(detection.confidence).toBe(0.9);
  });

  test("detects 'timeout' in text", () => {
    const result = { output: "Request timeout after 30000ms" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
    expect(detection.confidence).toBe(0.95); // timeout is in HIGH_CONFIDENCE_PATTERNS
  });

  test("detects 'connection refused' in text", () => {
    const result = { output: "Error: Connection refused on port 5432" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
    expect(detection.confidence).toBe(0.95);
  });

  test("detects HTTP 5xx errors", () => {
    const result = { output: "HTTP 500 Internal Server Error" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
    expect(detection.confidence).toBe(0.9);
  });

  test("detects HTTP 4xx errors with lower confidence when no other patterns match", () => {
    const result = { output: "HTTP 404" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
    expect(detection.confidence).toBe(0.7); // Only HTTP status code, no "not found"
  });

  test("detects 'killed' in text", () => {
    const result = { output: "Process killed by SIGKILL" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
    expect(detection.confidence).toBe(0.95);
  });

  test("detects 'exception' in text", () => {
    const result = { output: "NullPointerException at line 42" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
    expect(detection.confidence).toBe(0.95); // exception is in HIGH_CONFIDENCE_PATTERNS
  });

  test("detects 'stack trace' in text", () => {
    const result = { output: "Stack trace:\n  at Function.test()\n  at..." };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
  });

  test("detects error in content array", () => {
    const result = {
      content: [
        { type: "text", text: "Processing complete" },
        { type: "text", text: "Error: File not found" }
      ]
    };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
  });

  test("detects 'unauthorized' in text", () => {
    const result = { output: "401 Unauthorized: Invalid API key" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
    expect(detection.confidence).toBe(0.95);
  });

  test("detects 'forbidden' in text", () => {
    const result = { output: "403 Forbidden: Access denied" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
    expect(detection.confidence).toBe(0.95);
  });

  test("detects 'rate limit' with warning confidence", () => {
    const result = { output: "API rate limit exceeded. Retry after 60 seconds." };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
    expect(detection.confidence).toBe(0.5);
  });

  test("returns false for successful operation text", () => {
    const result = { output: "File created successfully at /path/to/file.txt" };
    const detection = detectError(result);
    expect(detection.isError).toBe(false);
    expect(detection.confidence).toBe(0.5);
  });

  test("returns false for empty output", () => {
    const result = { output: "" };
    const detection = detectError(result);
    expect(detection.isError).toBe(false);
  });

  test("extracts error message from output string", () => {
    const result = { output: "Error: permission denied for /path/to/file" };
    const detection = detectError(result);
    expect(detection.extractedErrorMessage).toBe("Error: permission denied for /path/to/file");
  });

  test("extracts error message from metadata", () => {
    const result = { metadata: { error: "Connection timeout" }, content: [] };
    const detection = detectError(result);
    expect(detection.extractedErrorMessage).toBe("Connection timeout");
  });

  test("extracts error message from content array", () => {
    const result = {
      content: [
        { type: "text", text: "First message" },
        { type: "text", text: "Error: Something failed" }
      ]
    };
    const detection = detectError(result);
    expect(detection.extractedErrorMessage).toContain("Error: Something failed");
  });

  test("returns high confidence for multiple critical patterns", () => {
    const result = { output: "Error: failed to access denied resource at /path" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
    expect(detection.confidence).toBe(0.95);
  });

  test("handles result as string directly", () => {
    const result = "Error: something went wrong";
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
  });

  test("handles null/undefined gracefully", () => {
    const detection1 = detectError(null);
    expect(detection1.isError).toBe(false);
    
    const detection2 = detectError(undefined);
    expect(detection2.isError).toBe(false);
  });

  test("handles non-error object with only content", () => {
    const result = {
      content: [{ type: "text", text: "Here is the information you requested" }]
    };
    const detection = detectError(result);
    expect(detection.isError).toBe(false);
  });
});

describe("ErrorDetector class", () => {
  test("allows registering tool-specific patterns", () => {
    const detector = new ErrorDetector();
    detector.registerToolPatterns("custom-tool", [
      { pattern: /custom error/i, type: "critical", description: "custom tool error" }
    ]);
    
    const result = { output: "custom error: specific to my tool" };
    const detection = detector.detect(result, "custom-tool");
    expect(detection.isError).toBe(true);
    expect(detection.reason).toContain("tool-specific");
  });

  test("tool-specific patterns take precedence for same match", () => {
    const detector = new ErrorDetector();
    detector.registerToolPatterns("my-tool", [
      { pattern: /special/i, type: "critical", description: "special pattern" }
    ]);
    
    const result = { output: "special error occurred" };
    const detection = detector.detect(result, "my-tool");
    expect(detection.isError).toBe(true);
    expect(detection.reason).toContain("special pattern");
  });

  test("tool-specific patterns don't affect other tools", () => {
    const detector = new ErrorDetector();
    detector.registerToolPatterns("special-tool", [
      { pattern: /unique-error/i, type: "critical", description: "unique" }
    ]);
    
    // Note: tool-specific patterns only affect their registered tool
    const result = { output: "This is a successful operation" };
    const detection = detector.detect(result, "other-tool");
    expect(detection.isError).toBe(false);
  });
});

describe("Edge cases", () => {
  test("detects error in result field", () => {
    const result = { result: "Operation failed: insufficient permissions" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
  });

  test("detects error in message field", () => {
    const result = { message: "Access denied to resource" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
  });

  test("handles nested error in metadata", () => {
    const result = {
      metadata: {
        error: { code: "ENOENT", message: "No such file" }
      }
    };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
  });

  test("case insensitive detection", () => {
    const result = { output: "ERROR IN CAPS" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
  });

  test("detects sigkill signal", () => {
    const result = { output: "Process received SIGKILL signal" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
    expect(detection.confidence).toBe(0.95);
  });

  test("detects non-zero exit code", () => {
    const result = { output: "Command exited with non-zero code: 127" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
  });

  test("detects 'read-only' filesystem", () => {
    const result = { output: "Cannot write: read-only filesystem" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
    expect(detection.confidence).toBe(0.9); // read-only is critical but not in HIGH_CONFIDENCE
  });

  test("detects 'network error'", () => {
    const result = { output: "Network error: connection reset by peer" };
    const detection = detectError(result);
    expect(detection.isError).toBe(true);
  });
});
