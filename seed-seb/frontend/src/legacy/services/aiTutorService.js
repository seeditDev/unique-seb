// aiTutorService.js - Client-side AI Tutor service powered by Transformers.js, Gemini API, and NVIDIA API

let localGenerator = null;

// Heuristic fallback syntax analyzer for instant, high-quality common error debugging
const checkCommonErrors = (errorStr, code, language) => {
  const err = (errorStr ?? '').toLowerCase();
  const lang = (language ?? '').toLowerCase();

  // 1. Missing semicolon
  if (err.includes("expected ';'") || err.includes("expected '; before") || err.includes("error: expected ';'")) {
    return "Semicolon missing. Check the line containing the error (and the line right before it) to make sure your statements end with a semicolon `;`.";
  }

  // 2. Bracket mismatch / unclosed parsing
  if (err.includes("reached end of file while parsing") || err.includes("expected '}'") || err.includes("expected ']'")) {
    return "Missing closing bracket. Ensure every opening brace `{`, bracket `[`, or parenthesis `(` has a matching closing pair in your code.";
  }

  // 3. Cannot find symbol / Undefined identifier
  if (err.includes("cannot find symbol") || err.includes("was not declared in this scope") || err.includes("is not defined")) {
    let nameHint = "";
    const match = errorStr.match(/symbol:\s+variable\s+(\w+)/) || errorStr.match(/scope:\s+note:\s+suggested\s+alternative:\s+‘(\w+)’/) || errorStr.match(/‘(\w+)’ was not declared/);
    if (match && match[1]) {
      nameHint = ` (specifically referring to "${match[1]}")`;
    }
    return `Unknown variable or function identifier${nameHint}. Check for spelling typos, verify that it is declared before use, and check if you forgot a required import or package include.`;
  }

  // 4. Python Indentation Errors
  if (lang === 'python3' || lang === 'python') {
    if (err.includes("indentationerror") || err.includes("expected an indented block")) {
      return "Indentation mismatch. Python relies strictly on consistent tab spaces. Make sure all statements inside a block (such as loops or if conditions) are aligned exactly with spaces or tabs.";
    }
  }

  // 5. Array Index Out of Bounds
  if (err.includes("indexoutofboundsexception") || err.includes("index out of range") || err.includes("segmentation fault") || err.includes("sigsegv")) {
    return "Array index out of bounds. Your code is attempting to access a memory position outside the array boundaries (e.g., accessing negative index or index >= size of array). Check your loop termination conditions!";
  }

  // 6. Divide by Zero
  if (err.includes("division by zero") || err.includes("/ by zero") || err.includes("arithmeticexception")) {
    return "Division by zero. You are attempting to divide a number by a variable that resolves to 0. Add a safety check before division.";
  }

  // 7. Missing Return Statement
  if (err.includes("missing return statement") || err.includes("control reaches end of non-void function")) {
    return "Missing return statement. Your function is declared to return a value, but code execution can reach the end of the block without returning anything. Make sure all paths have a return statement.";
  }

  // 8. Type mismatch
  if (err.includes("incompatible types") || err.includes("cannot convert") || err.includes("no matching function for call to")) {
    return "Type mismatch. You are trying to assign or pass a variable of one data type (e.g., String) to a variable that expects another type (e.g., Integer). Check your function argument types.";
  }

  return null;
};

// Rolling polynomial hash for response caching keys
const getCacheKey = (title, language, mode, code, error) => {
  const str = `${title}_${language}_${mode}_${code.trim()}_${error.trim()}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `tutor_cache_${hash}`;
};

// Google Gemini API Gateway Connection
const callGeminiAPI = async (apiKey, prompt) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 600
      }
    })
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Your Gemini API quota has been exhausted. Please wait for your quota to reset or enable billing in Google AI Studio.");
    }
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Gemini API error (Status ${response.status})`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
};

// NVIDIA NIM API Gateway Connection
const callNvidiaAPI = async (apiKey, prompt) => {
  const url = 'https://integrate.api.nvidia.com/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'meta/llama-3.1-70b-instruct',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 600
    })
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Your NVIDIA API quota has been exhausted. Please wait for your quota to reset or verify your API key.");
    }
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `NVIDIA API error (Status ${response.status})`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
};

// Format literal compiler error diagnostics with line numbers and code snippets
const formatLiteralError = (errorStr, userCode, language) => {
  const errText = (errorStr ?? '').trim();
  if (!errText) {
    return "No compiler or execution errors detected. Please run your code first to verify output.";
  }

  const lines = errText.split('\n').map(l => l.trim()).filter(Boolean);
  
  // Extract line numbers from GCC/Clang/Python/Java error format
  let lineNum = null;
  let errorMsg = "";

  const gccMatch = errText.match(/(?:solution|main|source|prog|Code|\.cpp|\.c|\.java|\.py)?[:\(]\s*(\d+)(?:[:\)]\d+)?[:\s]+(?:error|warning|fatal error)?[:\s]*(.*)/i);
  const javaMatch = errText.match(/[:\(]\s*(\d+)[:\)]?\s*:\s*error:\s*(.*)/i);
  const pyMatch = errText.match(/line\s+(\d+)/i);

  if (gccMatch && gccMatch[1]) {
    lineNum = gccMatch[1];
    errorMsg = gccMatch[2] || gccMatch[0];
  } else if (javaMatch && javaMatch[1]) {
    lineNum = javaMatch[1];
    errorMsg = javaMatch[2];
  } else if (pyMatch && pyMatch[1]) {
    lineNum = pyMatch[1];
    errorMsg = lines[lines.length - 1] ?? "";
  }

  let codeSnippet = "";
  if (lineNum && userCode) {
    const codeLines = userCode.split('\n');
    const idx = parseInt(lineNum, 10) - 1;
    if (idx >= 0 && idx < codeLines.length) {
      codeSnippet = codeLines[idx].trim();
    }
  }

  let result = "Literal Error Analysis:\n";
  if (lineNum) {
    result += `• Reported Error at Line ${lineNum}`;
    if (codeSnippet) {
      result += `: \`${codeSnippet}\``;
    }
    result += `\n`;
  }

  if (errorMsg) {
    result += `• Compiler Output: ${errorMsg}\n`;
  } else if (lines.length > 0) {
    result += `• Output: ${lines.slice(0, 3).join('\n')}\n`;
  }

  result += `\nActionable Fix: Verify syntax around line ${lineNum ?? ''}, check variable declarations and matching brackets/semicolons, then re-run.`;

  return result;
};

export const aiTutorService = {
  /**
   * Initialize local Transformers.js model (LaMini-GPT-124M)
   */
  async initLocalModel(onProgress) {
    if (localGenerator) return localGenerator;

    if (window.transformers) {
      const { pipeline } = window.transformers;
      localGenerator = await pipeline('text-generation', 'Xenova/LaMini-GPT-124M');
      return localGenerator;
    }
    throw new Error("Local AI model unavailable. Displaying literal error diagnostics.");
  },

  /**
   * Generates a tutor hint based on error string, student code, and problem context
   */
  async getHint({ problemTitle, problemStatement, explanation, sampleTestCases, userCode, compilerStderr, language, onProgress, tutorMode = 'hint' }) {
    const errText = (compilerStderr ?? '').trim();

    // 1. Only run AI Tutor if there IS an error when requesting hints
    if (tutorMode === 'hint' && !errText) {
      return {
        type: 'info',
        hint: "No compiler or execution errors detected. Run your code first to verify compiler output or test cases before requesting an AI hint."
      };
    }

    // A. Check local cache first to save user quotas
    const cacheKey = getCacheKey(problemTitle, language, tutorMode, userCode, errText);
    const cachedHint = localStorage.getItem(cacheKey);
    if (cachedHint) {
      return {
        type: 'cache',
        hint: cachedHint
      };
    }

    // B. If heuristic match is found and mode is standard hint, return it immediately
    if (tutorMode === 'hint') {
      const heuristicHint = checkCommonErrors(errText, userCode, language);
      if (heuristicHint) {
        localStorage.setItem(cacheKey, heuristicHint);
        return {
          type: 'heuristic',
          hint: heuristicHint
        };
      }
    }

    // Check API keys (Gemini / NVIDIA)
    const geminiKey = localStorage.getItem('gemini_api_key');
    const nvidiaKey = localStorage.getItem('nvidia_api_key');

    if (geminiKey || nvidiaKey) {
      // C. Format sample test cases & Prompt
      let formattedSamples = "";
      if (Array.isArray(sampleTestCases) && sampleTestCases.length > 0) {
        formattedSamples = sampleTestCases.map((s, i) => {
          let str = `Sample Case ${i + 1}:\nInput: ${s.input ?? ''}\nOutput: ${s.output}`;
          if (s.explanation) {
            str += `\nExplanation: ${s.explanation}`;
          }
          return str;
        }).join('\n\n');
      }

      const cleanError = (errText || 'Code executes but outputs incorrect results.').substring(0, 200);
      const cleanCode = (userCode ?? '').substring(0, 800);
      const cleanDesc = (problemStatement ?? '').substring(0, 800);
      const cleanExplanation = (explanation ?? '').substring(0, 400);

      let context = `Context: Coding challenge "${problemTitle}" in ${language}.\nDescription: ${cleanDesc}`;
      if (cleanExplanation) context += `\nExplanation: ${cleanExplanation}`;
      if (formattedSamples) context += `\n\nSample Test Cases:\n${formattedSamples}`;
      context += `\n\nCompiler error: ${cleanError}\nCode: ${cleanCode}`;

      let instruction = "";
      if (tutorMode === 'hint') {
        instruction = "Instruction: You are SEED Mentor. Explain the coding error or logic failure in 2 simple sentences. Give a concept hint. Do NOT show corrected code.";
      } else if (tutorMode === 'complexity') {
        instruction = "Instruction: You are SEED Mentor. Analyze the Time Complexity and Space Complexity of the student's code in simple terms. Do NOT show corrected code.";
      } else if (tutorMode === 'review') {
        instruction = "Instruction: You are SEED Mentor. Review the student's code quality and suggest optimizations. Do NOT show corrected code.";
      }

      const prompt = `${context}\n\n${instruction}\nTutor:`;

      try {
        let text = "";
        let type = "";
        if (geminiKey) {
          text = await callGeminiAPI(geminiKey, prompt);
          type = "gemini";
        } else if (nvidiaKey) {
          text = await callNvidiaAPI(nvidiaKey, prompt);
          type = "nvidia";
        }

        if (tutorMode === 'hint' && (text.includes("{") || text.includes(";") || text.includes("return ") || text.length < 5)) {
          text = "Double check your variable scopes, indices, and verify that you initialized all pointers or array inputs correctly before usage.";
        }

        if (text) {
          localStorage.setItem(cacheKey, text);
          return { type, hint: text };
        }
      } catch (apiErr) {
        console.warn("External AI API call failed, falling back to literal error analysis.", apiErr);
      }
    }

    // D. Fallback: Fast & 100% reliable Literal Compiler Error Diagnostics
    const literalHint = formatLiteralError(errText, userCode, language);
    localStorage.setItem(cacheKey, literalHint);
    return {
      type: 'literal',
      hint: literalHint
    };
  }
};
