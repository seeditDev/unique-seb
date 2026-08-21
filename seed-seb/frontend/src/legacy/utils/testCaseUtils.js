/**
 * testCaseUtils.js
 * Utility helper to handle and resolve test cases in SEED-IT Platform.
 * Supports:
 * - Regular test cases (type: "reg")
 * - Generator test cases (type: "gen") — resolved via a SAFE evaluator,
 *   NOT new Function(). Only a strict allowlist of expression shapes is
 *   processed; anything else is returned as-is.
 * - Auto-resolving input and expectedOutput expressions
 *
 * SECURITY NOTE:
 * The previous implementation used new Function() to evaluate "gen"
 * expressions. This was replaced with a safe expression evaluator that
 * handles only the patterns actually used in the SEED test bank:
 *   1. string.repeat(N)   — e.g. "0 ".repeat(100)
 *   2. Array(N).fill(V)   — e.g. Array(1000).fill(0)
 *   3. "A" + "B" string concatenation with .repeat()
 *   4. Pure JSON literals  — parsed with JSON.parse()
 * Any expression not matching these patterns is returned as a raw string.
 */

// ── Safe pattern matchers ────────────────────────────────────────────────────

/**
 * Try to evaluate a "string".repeat(N) expression.
 * Supports: "text".repeat(N) and ("a"+"b").repeat(N) forms.
 * @returns {string|null} result or null if pattern doesn't match.
 */
function tryEvalRepeat(expr) {
  // "literal".repeat(N)
  const simple = expr.match(/^(['"`])([\s\S]*?)\1\.repeat\((\d+)\)$/);
  if (simple) {
    const str = simple[2];
    const count = parseInt(simple[3], 10);
    if (count >= 0 && count <= 100_000) return str.repeat(count);
    return null;
  }
  // ("a" + "b" + ...).repeat(N) — only string literal concatenation
  const complex = expr.match(/^\(([\s\S]+)\)\.repeat\((\d+)\)$/);
  if (complex) {
    const inner = complex[1];
    const count = parseInt(complex[2], 10);
    // Only allow string-literal concatenation inside the parens
    const parts = inner.split(/\s*\+\s*/);
    const safe = parts.every(p => /^(['"`])[\s\S]*?\1$/.test(p.trim()));
    if (safe && count >= 0 && count <= 100_000) {
      const str = parts.map(p => p.trim().slice(1, -1)).join('');
      return str.repeat(count);
    }
  }
  return null;
}

/**
 * Try to evaluate Array(N).fill(V) expressions.
 * @returns {string|null} JSON-stringified array or null.
 */
function tryEvalArrayFill(expr) {
  const m = expr.match(/^Array\((\d+)\)\.fill\(([^)]*)\)$/);
  if (!m) return null;
  const count = parseInt(m[1], 10);
  if (count < 0 || count > 1_000_000) return null;
  const rawVal = m[2].trim();
  // Only allow simple literals: number, boolean, quoted string
  let fillVal;
  if (/^-?\d+(\.\d+)?$/.test(rawVal)) fillVal = Number(rawVal);
  else if (rawVal === 'true') fillVal = true;
  else if (rawVal === 'false') fillVal = false;
  else if (/^(['"`])[\s\S]*?\1$/.test(rawVal)) fillVal = rawVal.slice(1, -1);
  else return null;
  return JSON.stringify(Array(count).fill(fillVal));
}

/**
 * Try to evaluate simple string concatenation with embedded .repeat() calls.
 * Pattern: "A" + "B".repeat(N) + "C"
 * @returns {string|null}
 */
function tryEvalStringConcat(expr) {
  // Split on top-level ' + ' — only handle string literals and .repeat()
  // We'll parse char-by-char to handle quoted strings properly
  const parts = [];
  let i = 0;
  const len = expr.length;
  while (i < len) {
    // skip whitespace
    while (i < len && expr[i] === ' ') i++;
    if (i >= len) break;

    const ch = expr[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      // read quoted string
      let str = '';
      i++; // skip opening quote
      while (i < len && expr[i] !== ch) {
        if (expr[i] === '\\') i++; // skip escape
        str += expr[i++];
      }
      i++; // skip closing quote
      // check for .repeat(N)
      const repeatMatch = expr.slice(i).match(/^\.repeat\((\d+)\)/);
      if (repeatMatch) {
        const count = parseInt(repeatMatch[1], 10);
        if (count < 0 || count > 100_000) return null;
        parts.push(str.repeat(count));
        i += repeatMatch[0].length;
      } else {
        parts.push(str);
      }
    } else {
      // not a string literal — bail out
      return null;
    }
    // skip whitespace and '+'
    while (i < len && (expr[i] === ' ' || expr[i] === '+')) i++;
  }
  return parts.join('');
}

/**
 * Try JSON.parse() if the expression looks like a JSON literal.
 * Only tries if the expression starts with [ or {.
 * @returns {string|null}
 */
function tryEvalJsonLiteral(expr) {
  const trimmed = expr.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed);
  } catch (_) {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolves a raw test case value string (input or expected output).
 * For type "gen" expressions, uses a strict safe evaluator (no new Function).
 * @param {any} rawVal
 * @param {string} type - e.g. "gen" or "reg"
 * @returns {string} Fully evaluated and resolved string value
 */
export function resolveTestCaseValue(rawVal, type) {
  if (rawVal === undefined || rawVal === null) return '';
  const strVal = String(rawVal);

  const isGen = type === 'gen' ||
                strVal.includes('.repeat(') ||
                (strVal.includes('" + "') && strVal.startsWith('"[')) ||
                (strVal.includes('Array(') && strVal.includes('.fill('));

  if (!isGen) return strVal;

  const expr = strVal.trim();

  // Try each safe evaluator in priority order
  const result =
    tryEvalRepeat(expr) ??
    tryEvalArrayFill(expr) ??
    tryEvalStringConcat(expr) ??
    tryEvalJsonLiteral(expr);

  if (result !== null) return result;

  // Expression didn't match any safe pattern — return raw string.
  // Do NOT fall back to new Function().
  console.warn(
    '[TestCaseUtils] "gen" expression did not match any safe pattern; returning raw value.',
    { expr: expr.slice(0, 120) }
  );
  return strVal;
}

/**
 * Normalizes a single test case object, evaluating generated inputs/outputs if needed.
 * @param {Object} tc - Raw test case object
 * @returns {Object} Normalized test case with resolved input and expected properties
 */
export function normalizeTestCase(tc) {
  if (!tc) return tc;
  const isGen = tc.type === 'gen';
  const rawInput = tc.input !== undefined ? tc.input : '';
  const resolvedInput = resolveTestCaseValue(rawInput, tc.type);

  const rawExpected = tc.expectedOutput !== undefined
    ? tc.expectedOutput
    : (tc.expected !== undefined ? tc.expected : (tc.output !== undefined ? tc.output : (tc.expected_output !== undefined ? tc.expected_output : '')));
  const resolvedExpected = resolveTestCaseValue(rawExpected, tc.type);

  return {
    ...tc,
    id: tc.id || (tc.label  ?? ''),
    input: resolvedInput,
    expected: resolvedExpected,
    expectedOutput: resolvedExpected,
    isGenerated: isGen
  };
}

/**
 * Normalizes an array of test cases.
 * @param {Array} testCases
 * @returns {Array} Array of normalized test cases
 */
export function normalizeTestCaseArray(testCases) {
  if (!Array.isArray(testCases)) return [];
  return testCases.map(normalizeTestCase);
}
