export interface ErrorDetectionResult {
  isError: boolean;
  confidence: number;
  reason: string;
  errorType?: "critical" | "warning" | "ambiguous";
  extractedErrorMessage?: string;
}

interface ErrorPattern {
  pattern: RegExp;
  type: "critical" | "warning";
  description: string;
  exclusive?: boolean;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // Critical patterns - almost always indicate failure
  { pattern: /isError\s*[:=]\s*true/i, type: "critical", description: "isError flag set" },
  { pattern: /\berror\b/i, type: "critical", description: "contains 'error'" },
  { pattern: /\bfailed\b/i, type: "critical", description: "contains 'failed'" },
  { pattern: /\bfailure\b/i, type: "critical", description: "contains 'failure'" },
  { pattern: /permission denied/i, type: "critical", description: "permission denied" },
  { pattern: /access denied/i, type: "critical", description: "access denied" },
  { pattern: /unauthorized/i, type: "critical", description: "unauthorized" },
  { pattern: /forbidden/i, type: "critical", description: "forbidden" },
  { pattern: /not found/i, type: "critical", description: "not found" },
  { pattern: /no such (file|directory|device)/i, type: "critical", description: "no such file/directory" },
  { pattern: /does not exist/i, type: "critical", description: "does not exist" },
  { pattern: /cannot find/i, type: "critical", description: "cannot find" },
  { pattern: /cannot (open|read|write|create|delete|execute)/i, type: "critical", description: "cannot perform operation" },
  { pattern: /unable to/i, type: "critical", description: "unable to" },
  { pattern: /\binvalid\b/i, type: "critical", description: "invalid" },
  { pattern: /timeout/i, type: "critical", description: "timeout" },
  { pattern: /timed out/i, type: "critical", description: "timed out" },
  { pattern: /sigkill/i, type: "critical", description: "SIGKILL signal" },
  { pattern: /signal \d+/i, type: "critical", description: "process signal" },
  { pattern: /non-zero exit/i, type: "critical", description: "non-zero exit code" },
  { pattern: /exit code \d+/i, type: "critical", description: "exit code" },
  { pattern: /killed/i, type: "critical", description: "process killed" },
  { pattern: /crashed/i, type: "critical", description: "crashed" },
  { pattern: /segmentation fault/i, type: "critical", description: "segfault" },
  { pattern: /core dumped/i, type: "critical", description: "core dumped" },
  { pattern: /exception/i, type: "critical", description: "exception" },
  { pattern: /stack trace/i, type: "critical", description: "stack trace" },
  { pattern: /traceback/i, type: "critical", description: "traceback" },
  { pattern: /panic/i, type: "critical", description: "panic" },
  { pattern: /abort/i, type: "critical", description: "abort" },
  { pattern: /refused/i, type: "critical", description: "connection refused" },
  { pattern: /broken pipe/i, type: "critical", description: "broken pipe" },
  { pattern: /connection (reset|closed|failed)/i, type: "critical", description: "connection error" },
  { pattern: /host not found/i, type: "critical", description: "host not found" },
  { pattern: /network error/i, type: "critical", description: "network error" },
  { pattern: /dns (lookup)? failure/i, type: "critical", description: "DNS failure" },
  { pattern: /certificate (expired|invalid|self-signed)/i, type: "critical", description: "certificate error" },
  { pattern: /authentication failed/i, type: "critical", description: "auth failed" },
  { pattern: /incorrect password/i, type: "critical", description: "incorrect password" },
  { pattern: /token expired/i, type: "critical", description: "token expired" },
  { pattern: /rate limit/i, type: "warning", description: "rate limited" },
  { pattern: /quota exceeded/i, type: "warning", description: "quota exceeded" },
  { pattern: /deprecated/i, type: "warning", description: "deprecated feature" },
  { pattern: /could not/i, type: "warning", description: "could not complete" },
  { pattern: /failed to/i, type: "warning", description: "failed to" },
  { pattern: /error while/i, type: "warning", description: "error while" },
  { pattern: /\b4\d\d\b/, type: "warning", description: "HTTP 4xx client error", exclusive: true },
  { pattern: /\b5\d\d\b/, type: "critical", description: "HTTP 5xx server error", exclusive: true },
  { pattern: /parent directory does not exist/i, type: "critical", description: "parent directory missing" },
  { pattern: /file exists/i, type: "warning", description: "file already exists" },
  { pattern: /directory not empty/i, type: "warning", description: "directory not empty" },
  { pattern: /read-only/i, type: "critical", description: "read-only filesystem" },
  { pattern: /non-zero code/i, type: "critical", description: "non-zero exit code" },
];

const HIGH_CONFIDENCE_PATTERNS = [
  /isError\s*[:=]\s*true/i,
  /permission denied/i,
  /access denied/i,
  /unauthorized/i,
  /forbidden/i,
  /not found/i,
  /no such/i,
  /does not exist/i,
  /cannot find/i,
  /timeout/i,
  /timed out/i,
  /sigkill/i,
  /killed/i,
  /crashed/i,
  /segmentation fault/i,
  /exception/i,
  /panic/i,
  /refused/i,
  /broken pipe/i,
];

function extractErrorMessage(result: unknown): string | undefined {
  if (typeof result === "string") return result;

  if (typeof result === "object" && result !== null) {
    const o = result as Record<string, unknown>;

    if (Array.isArray(o.content) && o.content.length > 0) {
      const textParts: string[] = [];
      for (const block of o.content) {
        if (typeof block === "object" && block !== null) {
          const b = block as Record<string, unknown>;
          if (b.type === "text" && typeof b.text === "string") {
            textParts.push(b.text);
          }
        }
      }
      if (textParts.length > 0) return textParts.join("\n");
    }

    if (typeof o.output === "string") return o.output;
    if (typeof o.result === "string") return o.result;
    if (typeof o.message === "string") return o.message;

    if (o.metadata && typeof o.metadata === "object") {
      const meta = o.metadata as Record<string, unknown>;
      if (typeof meta.error === "string") return meta.error;
      if (typeof meta.message === "string") return meta.message;
    }
  }

  return undefined;
}

function checkIsErrorFlag(result: unknown): boolean {
  if (typeof result !== "object" || result === null) return false;
  const o = result as Record<string, unknown>;
  return o.isError === true || o.isError === "true";
}

function checkMetadata(result: unknown): { isError: boolean; message?: string } {
  if (typeof result !== "object" || result === null) return { isError: false };
  const o = result as Record<string, unknown>;

  if (o.metadata && typeof o.metadata === "object") {
    const meta = o.metadata as Record<string, unknown>;
    if (meta.error) return { isError: true, message: String(meta.error) };
    if (meta.failed === true) return { isError: true };
    if (meta.status === "error") return { isError: true };
  }

  if (o.error) return { isError: true, message: String(o.error) };
  if (o.failed === true) return { isError: true };

  return { isError: false };
}

function analyzePatterns(text: string): { hasError: boolean; confidence: number; matchedPatterns: string[]; exclusiveOnly: boolean } {
  const matchedPatterns: string[] = [];
  let highestConfidence = 0;
  let hasNonExclusive = false;

  for (const { pattern, type, description, exclusive } of ERROR_PATTERNS) {
    if (pattern.test(text)) {
      matchedPatterns.push(description);
      const confidence = type === "critical" ? 0.9 : 0.5;
      if (confidence > highestConfidence) highestConfidence = confidence;
      if (!exclusive) hasNonExclusive = true;
    }
  }

  return {
    hasError: matchedPatterns.length > 0,
    confidence: highestConfidence,
    matchedPatterns,
    exclusiveOnly: !hasNonExclusive && matchedPatterns.length > 0,
  };
}

function analyzeHttpStatus(text: string): { isError: boolean; confidence: number } {
  const httpErrorPattern = /\b(4\d\d|5\d\d)\b/;
  const match = text.match(httpErrorPattern);
  if (match) {
    const code = parseInt(match[1], 10);
    if (code >= 500) return { isError: true, confidence: 0.9 };
    if (code >= 400) return { isError: true, confidence: 0.7 };
  }
  return { isError: false, confidence: 0 };
}

export function detectError(result: unknown): ErrorDetectionResult {
  // Stage 1: Check isError flag (highest priority)
  if (checkIsErrorFlag(result)) {
    const message = extractErrorMessage(result);
    return {
      isError: true,
      confidence: 1.0,
      reason: "isError flag set to true",
      errorType: "critical",
      extractedErrorMessage: message,
    };
  }

  // Stage 2: Check metadata for error indicators
  const metaResult = checkMetadata(result);
  if (metaResult.isError) {
    return {
      isError: true,
      confidence: 0.95,
      reason: "error found in metadata",
      errorType: "critical",
      extractedErrorMessage: metaResult.message,
    };
  }

  // Stage 3: Extract and analyze text content
  const errorMessage = extractErrorMessage(result);
  if (errorMessage) {
    // Check for high-confidence patterns first
    for (const pattern of HIGH_CONFIDENCE_PATTERNS) {
      if (pattern.test(errorMessage)) {
        return {
          isError: true,
          confidence: 0.95,
          reason: `high-confidence pattern matched: ${pattern.source}`,
          errorType: "critical",
          extractedErrorMessage: errorMessage,
        };
      }
    }

    // General pattern analysis
    const patternResult = analyzePatterns(errorMessage);
    if (patternResult.hasError) {
      // If only exclusive patterns matched (like HTTP status codes), use their specific confidence
      if (patternResult.exclusiveOnly) {
        const httpMatch = errorMessage.match(/\b(4\d\d|5\d\d)\b/);
        if (httpMatch) {
          const code = parseInt(httpMatch[1], 10);
          const confidence = code >= 500 ? 0.9 : 0.7;
          return {
            isError: true,
            confidence,
            reason: `HTTP ${code} error`,
            errorType: code >= 500 ? "critical" : "warning",
            extractedErrorMessage: errorMessage,
          };
        }
      }

      return {
        isError: true,
        confidence: patternResult.confidence,
        reason: `matched patterns: ${patternResult.matchedPatterns.join(", ")}`,
        errorType: patternResult.confidence >= 0.7 ? "critical" : "warning",
        extractedErrorMessage: errorMessage,
      };
    }

    // Check for ambiguous cases - single word responses that might be errors
    const trimmed = errorMessage.trim();
    if (
      trimmed.length < 50 &&
      (trimmed.includes("Error") || trimmed.includes("Failed") || trimmed.includes("Denied"))
    ) {
      return {
        isError: true,
        confidence: 0.6,
        reason: "short error response detected",
        errorType: "ambiguous",
        extractedErrorMessage: errorMessage,
      };
    }
  }

  // Stage 4: Success - no error detected
  return {
    isError: false,
    confidence: errorMessage ? 0.5 : 0.0,
    reason: errorMessage ? "no error patterns matched" : "no error content found",
  };
}

export class ErrorDetector {
  private toolSpecificPatterns: Map<string, ErrorPattern[]> = new Map();

  registerToolPatterns(toolName: string, patterns: ErrorPattern[]): void {
    this.toolSpecificPatterns.set(toolName, patterns);
  }

  detect(result: unknown, toolName?: string): ErrorDetectionResult {
    // Check tool-specific patterns first if a tool name is provided
    if (toolName) {
      const toolPatterns = this.toolSpecificPatterns.get(toolName);
      if (toolPatterns) {
        const errorMessage = extractErrorMessage(result);
        if (errorMessage) {
          for (const { pattern, type, description } of toolPatterns) {
            if (pattern.test(errorMessage)) {
              return {
                isError: true,
                confidence: type === "critical" ? 0.95 : 0.7,
                reason: `tool-specific pattern matched: ${description}`,
                errorType: type,
                extractedErrorMessage: errorMessage,
              };
            }
          }
        }
      }
    }

    // Fall back to base detection
    return detectError(result);
  }
}
