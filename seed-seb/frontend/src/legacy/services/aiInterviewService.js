import axios from 'axios';

// Question bank for local fallback simulation if no API key is provided
const FALLBACK_QUESTION_BANKS = {
  Java: [
    "Explain the concept of OOPs in Java. What are the four main pillars?",
    "What is the difference between an Abstract Class and an Interface in Java, especially after Java 8?",
    "How does Garbage Collection work in Java? What is the difference between Stack and Heap memory?",
    "Explain the Java Collections Framework. What is the difference between ArrayList and LinkedList?",
    "What are Checked and Unchecked Exceptions in Java? How do you handle them?"
  ],
  DSA: [
    "What is the difference between a Array and a Linked List? What are their time complexities for insertion?",
    "Explain the binary search algorithm. What is its time complexity and space complexity?",
    "How does a Hash Map work under the hood? What is collision resolution?",
    "Explain the difference between Depth First Search (DFS) and Breadth First Search (BFS) in graphs.",
    "What is dynamic programming? How does it differ from divide and conquer?"
  ],
  Python: [
    "What are list comprehensions in Python? Give an example.",
    "Explain the difference between mutable and immutable data types in Python. Give examples of each.",
    "What are decorators in Python and how do they work?",
    "Explain how memory management and reference counting work in Python.",
    "What is the difference between a list and a tuple? When would you prefer one over the other?"
  ],
  SQL: [
    "What is the difference between INNER JOIN, LEFT JOIN, and RIGHT JOIN in SQL?",
    "Explain the concept of database normalization. What are 1NF, 2NF, and 3NF?",
    "What are SQL indexes? How do they improve query performance, and what are their drawbacks?",
    "What is the difference between GROUP BY and HAVING clauses?",
    "What are ACID properties in a relational database management system?"
  ],
  C: [
    "What is a pointer in C? How do you declare and dereference a pointer?",
    "Explain the difference between malloc(), calloc(), realloc(), and free() for dynamic memory allocation.",
    "What is a structure in C? How does it differ from a union?",
    "Explain the difference between pass-by-value and pass-by-reference in C.",
    "What is a segmentation fault? What are the common causes in C programs?"
  ],
  HR: [
    "Tell me about yourself. Walk me through your academic achievements and projects.",
    "What are your greatest strengths and weaknesses?",
    "Describe a challenging project you worked on. How did you handle conflicts or setbacks?",
    "Where do you see yourself in the next 5 years? What are your career aspirations?",
    "Why should we hire you? What makes you a good fit for our technical program?"
  ],
  "System Design": [
    "Design a URL shortening service like Bitly. What are the key database schemas and load requirements?",
    "What is load balancing? Explain the difference between round-robin and least-connections routing.",
    "Explain the concept of caching. What are cache eviction policies like LRU?",
    "What is database sharding and partitioning? When should you use them?",
    "How do you design a real-time notification service for millions of active users?"
  ]
};

const DEFAULT_FALLBACK_QUESTIONS = [
  "Walk me through your background and technical projects.",
  "What is your approach to solving complex engineering bugs?",
  "How do you stay up-to-date with new technologies and frameworks?",
  "Describe a time you had to work in a team. How did you handle differences in technical opinions?",
  "What are your primary goals for this placements drive?"
];

let localGenerator = null;

export const aiInterviewService = {
  /**
   * Helper to check if a valid API key is present
   */
  hasApiKey(apiKey) {
    return typeof apiKey === 'string' && (apiKey.trim().startsWith('gsk_') || apiKey.trim().startsWith('sk-'));
  },

  async initLocalModel(onProgress) {
    if (localGenerator) return localGenerator;
    
    // Dynamically inject script tag to bypass compile-time Webpack dynamic import blocks
    const loadTransformersScript = () => {
      return new Promise((resolve, reject) => {
        if (window.transformers) {
          resolve(window.transformers);
          return;
        }
        const existingScript = document.getElementById('transformers-cdn-script');
        if (existingScript) {
          existingScript.addEventListener('load', () => resolve(window.transformers));
          existingScript.addEventListener('error', (err) => reject(err));
          return;
        }
        const script = document.createElement('script');
        script.id = 'transformers-cdn-script';
        script.src = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
        script.async = true;
        script.onload = () => {
          console.log("[SEED-SEB] Transformers.js UMD bundle loaded successfully from CDN.");
          resolve(window.transformers);
        };
        script.onerror = (err) => {
          console.error("[SEED-SEB] Failed to load Transformers.js script:", err);
          reject(err);
        };
        document.head.appendChild(script);
      });
    };

    try {
      const transformers = await loadTransformersScript();
      if (!transformers) throw new Error("Transformers.js global object not found.");
      
      const { pipeline, env } = transformers;
      env.allowLocalModels = false; // force fetching web assets
      
      let modelSource = 'Xenova/LaMini-GPT-124M';

      // Check if we can load the local model files from the desktop compiler assets space
      if (window.desktopBridge && typeof window.desktopBridge.getLocalModelPort === 'function') {
        try {
          const port = window.desktopBridge.getLocalModelPort();
          if (port > 0) {
            modelSource = `http://127.0.0.1:${port}/interviewmodels/LaMini-GPT-124M/`;
            console.log(`[SEED-SEB] Redirected Transformers.js to local compiler space: ${modelSource}`);
          }
        } catch (bridgeErr) {
          console.warn("Could not query desktop model server port from QWebChannel:", bridgeErr);
        }
      }

      // Load LaMini-GPT-124M model (loaded either from local compiler space or fallback CDN)
      localGenerator = await pipeline('text-generation', modelSource, {
        progress_callback: (data) => {
          if (data.status === 'progress' && typeof onProgress === 'function') {
            onProgress(Math.round(data.progress));
          }
        }
      });
      return localGenerator;
    } catch (e) {
      console.error("Local model initialization failed:", e);
      throw e;
    }
  },

  /**
   * Fetches the next question from Groq LLM, local Web LLM pipeline, or uses local fallback bank
   */
  async getNextQuestion(chatHistory, domain, difficulty, company, apiKey, useLocalModel, onProgress) {
    const hasKey = this.hasApiKey(apiKey);

    // 1. Web LLM mode (Option 1)
    if (!hasKey && useLocalModel) {
      try {
        const generator = await this.initLocalModel(onProgress);
        const askedCount = chatHistory.filter(msg => msg.role === 'assistant').length;
        const qBank = FALLBACK_QUESTION_BANKS[domain] || DEFAULT_FALLBACK_QUESTIONS;
        
        if (askedCount >= 5) {
          return "Thank you, the interview is now complete. Please click the button below to generate your evaluation report.";
        }

        const userMessages = chatHistory.filter(m => m.role === 'user');
        const latestUserMessage = userMessages[userMessages.length - 1]?.content ?? '';

        if (!latestUserMessage) {
          return qBank[0];
        }

        // Prompt template for LaMini text generation
        const prompt = `Context: Technical interview for ${domain} developer. Candidate said: "${latestUserMessage}". Ask a short follow up question.
Interviewer:`;

        const output = await generator(prompt, {
          max_new_tokens: 50,
          temperature: 0.6,
          repetition_penalty: 1.2
        });

        let text = output[0].generated_text.trim();
        if (text.includes("Interviewer:")) {
          text = text.split("Interviewer:").pop().trim();
        }
        
        // Clean output: prevent empty strings
        if (text.length < 5) {
          return qBank[askedCount % qBank.length];
        }
        return text;
      } catch (err) {
        console.error("WASM model execution failed. Falling back to local static bank.", err);
        // Fall back to rule-based bank
      }
    }

    // 2. Local rule-based static bank mode (No Key & no WebLLM)
    if (!hasKey) {
      const qBank = FALLBACK_QUESTION_BANKS[domain] || DEFAULT_FALLBACK_QUESTIONS;
      const askedCount = chatHistory.filter(msg => msg.role === 'assistant').length;
      
      if (askedCount >= 5) {
        return "Thank you, the interview is now complete. Please click the button below to generate your evaluation report.";
      }
      return qBank[askedCount];
    }

    // 3. Cloud LLM Mode (Groq / OpenAI)
    try {
      const systemPrompt = `You are an expert technical interviewer conducting a mock interview with a candidate for a ${domain} developer role (Difficulty: ${difficulty}, Company Context: ${company}).
Conduct a realistic, professional, and interactive interview.
Guidelines:
1. Ask exactly ONE question at a time.
2. Wait for the candidate's response before asking the next question or providing follow-up feedback.
3. You can ask clarifying or follow-up questions if their answer is incomplete, shallow, or has errors.
4. Never reveal the correct answers immediately. Instead, guide them through reasoning.
5. The interview should consist of 5 questions in total. Keep track of the progress.
6. On the final (5th) question, let the candidate know the interview is complete, and say exactly: "Thank you, the interview is now complete. Please click the button below to generate your evaluation report."
7. Start immediately by asking the first interview question. Do not add introductory chit-chat. Just ask Question 1.`;

      const formattedMessages = [
        { role: 'system', content: systemPrompt },
        ...chatHistory.map(msg => ({ role: msg.role, content: msg.content }))
      ];

      const isGroq = apiKey.trim().startsWith('gsk_');
      const apiUrl = isGroq 
        ? "https://api.groq.com/openai/v1/chat/completions" 
        : "https://api.openai.com/v1/chat/completions";
      
      const modelName = isGroq ? "llama-3.3-70b-versatile" : "gpt-4o-mini";

      const res = await axios.post(
        apiUrl,
        {
          model: modelName,
          messages: formattedMessages,
          temperature: 0.7,
          max_tokens: 300
        },
        {
          headers: {
            "Authorization": `Bearer ${apiKey.trim()}`,
            "Content-Type": "application/json"
          }
        }
      );

      return res.data.choices[0].message.content;
    } catch (err) {
      console.error("Cloud completion fetch failed, falling back to static questions.", err);
      const qBank = FALLBACK_QUESTION_BANKS[domain] || DEFAULT_FALLBACK_QUESTIONS;
      const askedCount = chatHistory.filter(msg => msg.role === 'assistant').length;
      return qBank[askedCount % qBank.length];
    }
  },

  /**
   * Generates evaluation report from Groq LLM, local generator, or uses local smart rule analyzer
   */
  async getEvaluationReport(chatHistory, domain, difficulty, company, apiKey, useLocalModel) {
    const hasKey = this.hasApiKey(apiKey);

    if (!hasKey) {
      // Local fallback evaluation metrics based on transcript analysis
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate loading delay
      
      const studentAnswers = chatHistory.filter(msg => msg.role === 'user');
      const totalWords = studentAnswers.reduce((acc, msg) => acc + msg.content.split(/\s+/).length, 0);
      const averageWordLength = studentAnswers.length ? (totalWords / studentAnswers.length) : 0;
      
      let technical = 7.0 + Math.min(2.0, averageWordLength / 100);
      let communication = 7.5 + Math.min(1.5, averageWordLength / 120);
      let problemSolving = 7.0 + (difficulty === 'Easy' ? 1.0 : difficulty === 'Medium' ? 1.5 : 2.0);
      let confidence = 7.0 + Math.min(2.0, studentAnswers.length * 0.3);
      
      if (difficulty === 'Hard') {
        technical -= 0.5;
      }

      technical = parseFloat(Math.min(10.0, Math.max(1.0, technical)).toFixed(1));
      communication = parseFloat(Math.min(10.0, Math.max(1.0, communication)).toFixed(1));
      problemSolving = parseFloat(Math.min(10.0, Math.max(1.0, problemSolving)).toFixed(1));
      confidence = parseFloat(Math.min(10.0, Math.max(1.0, confidence)).toFixed(1));
      
      const overall = parseFloat(((technical + communication + problemSolving + confidence) / 4).toFixed(1));

      const strengths = [
        `Demonstrated a solid understanding of fundamental ${domain} concepts.`,
        "Able to follow logic streams and structure answers chronologically.",
        "Active communicator who addressed the prompts directly."
      ];

      const weaknesses = [
        difficulty === 'Hard' 
          ? "Struggled slightly when asked to explain corner cases or time complexity constraints."
          : "Answers could benefit from more specific, concrete code examples.",
        "Could explain OOP design patterns or execution architectures in more depth."
      ];

      const tips = [
        "Include dynamic code snippets or database schema details to support theoretical assertions.",
        `Practice building mock mini-projects focused on ${domain} advanced principles.`,
        "Ensure you address time and space complexities proactively in placement rounds."
      ];

      return {
        score_technical: technical,
        score_communication: communication,
        score_problem_solving: problemSolving,
        score_confidence: confidence,
        score_overall: overall,
        strengths,
        weaknesses,
        tips,
        summary: `The candidate demonstrated Placement-ready foundational knowledge in ${domain} (${difficulty} level). Communication is structured, although technical answers can be expanded with real-world examples and runtime profiling metrics.`
      };
    }

    // Call Groq / OpenAI API
    try {
      const systemPrompt = `You are an expert technical evaluation engine. Analyze the following interview transcript between a candidate and an AI interviewer.
Generate a detailed, objective evaluation report.
The candidate's details are:
- Domain: ${domain}
- Difficulty: ${difficulty}
- Company Style: ${company}

You MUST respond with a single, valid JSON object ONLY. Do not write any markdown formatting, code blocks (such as \`\`\`json), backticks, introduction, or explanation. The response must be parsable by JSON.parse.
The JSON structure MUST match this exactly:
{
  "score_technical": <number between 1.0 and 10.0>,
  "score_communication": <number between 1.0 and 10.0>,
  "score_problem_solving": <number between 1.0 and 10.0>,
  "score_confidence": <number between 1.0 and 10.0>,
  "score_overall": <number between 1.0 and 10.0>,
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "tips": ["tip 1", "tip 2"],
  "summary": "concise overall feedback summary text"
}`;

      const transcriptStr = chatHistory.map(msg => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n\n');
      
      const isGroq = apiKey.trim().startsWith('gsk_');
      const apiUrl = isGroq 
        ? "https://api.groq.com/openai/v1/chat/completions" 
        : "https://api.openai.com/v1/chat/completions";
      
      const modelName = isGroq ? "llama-3.3-70b-versatile" : "gpt-4o-mini";

      const res = await axios.post(
        apiUrl,
        {
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Here is the interview transcript:\n\n${transcriptStr}` }
          ],
          temperature: 0.3
        },
        {
          headers: {
            "Authorization": `Bearer ${apiKey.trim()}`,
            "Content-Type": "application/json"
          }
        }
      );

      let cleanText = res.data.choices[0].message.content.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.substring(7);
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.substring(3);
      }
      if (cleanText.endsWith('```')) {
        cleanText = cleanText.substring(0, cleanText.length - 3);
      }
      cleanText = cleanText.trim();

      return JSON.parse(cleanText);
    } catch (err) {
      console.error("Failed to parse LLM evaluation, returning rule-based metrics.", err);
      return this.getEvaluationReport(chatHistory, domain, difficulty, company, "", false);
    }
  },

  /**
   * Saves the result record to local storage
   */
  async saveResults(user, domain, difficulty, company, scores, chatHistory, durationSeconds) {
    if (!user) throw new Error("User registration data is required to save results.");

    const email = user.email ?? "";
    const name = user.name ?? "";
    const rollNumber = user.rollNumber || (user.roll  ?? "");
    const college = user.college ?? "";
    const year = user.year ?? "";
    const dept = user.department ?? "";

    const feedbackData = {
      strengths: scores.strengths || [],
      weaknesses: scores.weaknesses || [],
      tips: scores.tips || [],
      summary: scores.summary ?? "",
      chatHistory: chatHistory.map(msg => ({ role: msg.role, content: msg.content }))
    };

    const record = {
      id: Date.now().toString(),
      created_at: new Date().toISOString(),
      roll_number: rollNumber,
      name: name,
      email: email,
      college: college,
      year: year,
      department: dept,
      domain: domain,
      difficulty: difficulty,
      company: company,
      score_technical: parseFloat(scores.score_technical || 0),
      score_communication: parseFloat(scores.score_communication || 0),
      score_problem_solving: parseFloat(scores.score_problem_solving || 0),
      score_confidence: parseFloat(scores.score_confidence || 0),
      score_overall: parseFloat(scores.score_overall || 0),
      feedback: feedbackData,
      duration_seconds: parseInt(durationSeconds || 0, 10)
    };

    try {
      const key = `ai_interview_results_${email}`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.unshift(record);
      localStorage.setItem(key, JSON.stringify(existing));
    } catch (e) {
      console.warn('[aiInterviewService] Failed to save result to localStorage:', e);
    }

    return [record];
  },

  /**
   * Fetches previous interview attempts for this student email
   */
  async fetchAttempts(email) {
    if (!email) return [];
    try {
      const key = `ai_interview_results_${email}`;
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      console.warn('[aiInterviewService] Failed to fetch attempts from localStorage:', e);
      return [];
    }
  }
};
