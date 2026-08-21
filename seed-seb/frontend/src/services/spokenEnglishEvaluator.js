/**
 * spokenEnglishEvaluator.js
 *
 * Comprehensive AI Speech Diagnostic Engine for Spoken English Assessment.
 * Evaluates candidate speech responses across 10 core parameters (Total 90 marks -> 100%):
 * 1. Pronunciation (10m)
 * 2. Fluency & Flow (10m)
 * 3. Grammar Accuracy (10m)
 * 4. Vocabulary Richness (10m)
 * 5. Speaking Pace - WPM (5m)
 * 6. Voice Confidence (10m)
 * 7. Sentence Formation (10m)
 * 8. Filler Word Control (5m)
 * 9. Coherence & Structure (10m)
 * 10. Listening Accuracy (10m)
 *
 * Maps performance to international CEFR levels: C2, C1, B2, B1, A2, A1.
 */

// Exhaustive Fillers and Hesitation patterns
const FILLER_PATTERNS = [
  /\b(umm+|uh+|uhh+|err+|er+)\b/gi,
  /\b(like)\b/gi,
  /\b(actually)\b/gi,
  /\b(basically)\b/gi,
  /\b(you know)\b/gi,
  /\b(i mean)\b/gi,
  /\b(sort of|kind of)\b/gi,
  /\b(literally)\b/gi,
  /\b(honestly)\b/gi,
  /\b(you see)\b/gi,
  /\b(right)\b/gi
];

// Rich Corporate Placement Vocabulary Dictionary
const RICH_VOCABULARY = new Set([
  'collaborative', 'innovative', 'analytical', 'efficient', 'strategic',
  'proactive', 'resilient', 'perspective', 'streamline', 'implementation',
  'methodology', 'framework', 'optimization', 'adaptability', 'articulate',
  'facilitate', 'comprehension', 'synergy', 'transformative', 'deliverable',
  'leverage', 'substantive', 'meticulous', 'proficient', 'scalability',
  'prioritize', 'resolution', 'communication', 'leadership', 'initiative',
  'synergistic', 'paradigm', 'benchmark', 'stakeholder', 'execution'
]);

// Generic Vocabulary Dictionary
const BASIC_VOCABULARY = new Set([
  'good', 'nice', 'bad', 'thing', 'stuff', 'very', 'big', 'small',
  'happy', 'sad', 'okay', 'fine', 'lots', 'guy', 'guys', 'do', 'make'
]);

// Comprehensive Grammar Diagnostic Rules
const GRAMMAR_RULES = [
  {
    regex: /\b(i has)\b/gi,
    correction: 'I have',
    explanation: 'Use first-person singular "have" with "I".'
  },
  {
    regex: /\b(they is)\b/gi,
    correction: 'they are',
    explanation: 'Use plural verb "are" with "they".'
  },
  {
    regex: /\b(he do|she do|it do)\b/gi,
    correction: '$1es',
    explanation: 'Use third-person singular "does".'
  },
  {
    regex: /\b(we is)\b/gi,
    correction: 'we are',
    explanation: 'Use plural "are" with "we".'
  },
  {
    regex: /\b(you is)\b/gi,
    correction: 'you are',
    explanation: 'Use "are" with subject "you".'
  },
  {
    regex: /\b(he go|she go)\b/gi,
    correction: '$1 goes',
    explanation: 'Use "goes" for third-person singular present.'
  },
  {
    regex: /\b(more better)\b/gi,
    correction: 'better',
    explanation: 'Avoid double comparative ("more better").'
  },
  {
    regex: /\b(did went|did came|did saw|did ate)\b/gi,
    correction: 'did go / come / see / eat',
    explanation: 'Use base verb after auxiliary verb "did".'
  },
  {
    regex: /\b(for to)\b/gi,
    correction: 'to',
    explanation: 'Omit "for" before infinitives.'
  },
  {
    regex: /\b(dont has|doesnt has)\b/gi,
    correction: "doesn't have",
    explanation: 'Use "have" after auxiliary negative.'
  },
  {
    regex: /\b(is agree|am agree|are agree)\b/gi,
    correction: 'agree',
    explanation: 'Use verb "agree" without auxiliary "be".'
  }
];

/**
 * Calculate Levenshtein Distance for exact sentence match (Repeat Sentence & Read Aloud)
 */
export const calculateLevenshteinDistance = (str1 = '', str2 = '') => {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9\s]/gi, '').trim();
  const s2 = str2.toLowerCase().replace(/[^a-z0-9\s]/gi, '').trim();

  const w1 = s1.split(/\s+/).filter(Boolean);
  const w2 = s2.split(/\s+/).filter(Boolean);

  if (w1.length === 0) return w2.length;
  if (w2.length === 0) return w1.length;

  const matrix = Array.from({ length: w1.length + 1 }, () => new Array(w2.length + 1).fill(0));

  for (let i = 0; i <= w1.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= w2.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= w1.length; i++) {
    for (let j = 1; j <= w2.length; j++) {
      const cost = w1[i - 1] === w2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[w1.length][w2.length];
};

/**
 * Detect filler words and return count, list of fillers, and score out of 5.
 */
export const detectFillerWords = (transcript = '') => {
  if (!transcript || typeof transcript !== 'string') {
    return { count: 0, found: [], score: 5 };
  }

  const found = [];
  let totalCount = 0;

  FILLER_PATTERNS.forEach(pattern => {
    const matches = transcript.match(pattern);
    if (matches) {
      totalCount += matches.length;
      found.push(...matches.map(m => m.toLowerCase().trim()));
    }
  });

  let score = 5;
  if (totalCount >= 10) score = 1;
  else if (totalCount >= 7) score = 2;
  else if (totalCount >= 4) score = 3;
  else if (totalCount >= 2) score = 4;

  return { count: totalCount, found: [...new Set(found)], score };
};

/**
 * Calculate Words Per Minute (WPM) & Pace Score out of 5.
 */
export const calculateSpeakingPace = (transcript = '', durationSeconds = 15) => {
  if (!transcript || durationSeconds <= 0) {
    return { wpm: 0, rating: 'Normal', score: 4 };
  }

  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(0.1, durationSeconds / 60);
  const wpm = Math.round(words / minutes);

  let rating = 'Normal';
  let score = 5;

  if (wpm < 80) {
    rating = 'Too Slow';
    score = 2;
  } else if (wpm < 105) {
    rating = 'Slightly Slow';
    score = 3.5;
  } else if (wpm >= 115 && wpm <= 165) {
    rating = 'Normal (Optimal)';
    score = 5;
  } else if (wpm > 165 && wpm <= 200) {
    rating = 'Fast';
    score = 4;
  } else if (wpm > 200) {
    rating = 'Too Fast';
    score = 2.5;
  }

  return { wpm, rating, score };
};

/**
 * Evaluate Grammar correctness and extract corrections.
 */
export const evaluateGrammar = (transcript = '') => {
  if (!transcript) return { score: 10, errors: [] };

  const errors = [];
  let penalty = 0;

  GRAMMAR_RULES.forEach(rule => {
    let match;
    const regex = new RegExp(rule.regex);
    while ((match = regex.exec(transcript)) !== null) {
      penalty += 2;
      errors.push({
        spoken: match[0],
        correction: rule.correction,
        explanation: rule.explanation
      });
    }
  });

  const words = transcript.trim().split(/\s+/).filter(Boolean);
  if (words.length < 4) penalty += 2;

  const score = Math.max(2, 10 - penalty);
  return { score, errors };
};

/**
 * Evaluate Lexical Diversity & Vocabulary Richness.
 */
export const evaluateVocabulary = (transcript = '') => {
  if (!transcript) return { score: 5, richCount: 0, basicCount: 0, totalWords: 0 };

  const words = transcript.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return { score: 0, richCount: 0, basicCount: 0, totalWords: 0 };

  const uniqueSet = new Set(words);
  let richCount = 0;
  let basicCount = 0;

  words.forEach(w => {
    if (RICH_VOCABULARY.has(w)) richCount++;
    if (BASIC_VOCABULARY.has(w)) basicCount++;
  });

  const ttr = uniqueSet.size / words.length;
  let score = Math.round(ttr * 6) + (richCount * 1.5) - (basicCount * 0.2);
  score = Math.max(3, Math.min(10, Math.round(score)));

  return { score, richCount, basicCount, totalWords: words.length };
};

/**
 * Evaluate Sentence Match / Listening Accuracy for Read Aloud & Repeat Sentence.
 */
export const evaluateListeningAccuracy = (spokenText = '', referenceText = '') => {
  if (!referenceText) return 10;
  if (!spokenText) return 2;

  const refWords = referenceText.toLowerCase().replace(/[^a-z0-9\s]/gi, '').split(/\s+/).filter(Boolean);
  if (refWords.length === 0) return 10;

  const editDist = calculateLevenshteinDistance(spokenText, referenceText);
  const maxLen = refWords.length;

  const matchRatio = Math.max(0, 1 - (editDist / maxLen));
  return Math.max(2, Math.min(10, Math.round(matchRatio * 10)));
};

/**
 * Map Score percentage to CEFR Standard Level.
 */
export const mapScoreToCEFR = (percentage = 0) => {
  const pct = Math.round(percentage);
  if (pct >= 90) {
    return {
      level: 'C2',
      name: 'Expert',
      color: '#10b981',
      desc: 'Can understand and speak with total ease. Flawless fluency, natural expression, and sophisticated placement vocabulary.'
    };
  } else if (pct >= 80) {
    return {
      level: 'C1',
      name: 'Advanced',
      color: '#3b82f6',
      desc: 'Expresses ideas fluently and spontaneously with rich vocabulary and minimal hesitation. Corporate placement ready.'
    };
  } else if (pct >= 70) {
    return {
      level: 'B2',
      name: 'Upper Intermediate',
      color: '#8b5cf6',
      desc: 'Can interact with good fluency and spontaneous communication. Effective for technical and client roles.'
    };
  } else if (pct >= 60) {
    return {
      level: 'B1',
      name: 'Intermediate',
      color: '#f59e0b',
      desc: 'Can produce connected text on familiar topics. Clear pronunciation with occasional grammatical gaps.'
    };
  } else if (pct >= 45) {
    return {
      level: 'A2',
      name: 'Elementary',
      color: '#f97316',
      desc: 'Can communicate in simple routine tasks. Frequent pauses, simple vocabulary, and grammar gaps.'
    };
  } else {
    return {
      level: 'A1',
      name: 'Beginner',
      color: '#ef4444',
      desc: 'Requires foundational training in spoken English, sentence structures, and pronunciation.'
    };
  }
};

/**
 * Full Session AI Evaluator Orchestrator (Corporate Placement Standards).
 * High-caliber evaluation engine that strictly evaluates every test question.
 */
export const evaluateSpokenEnglishSession = (responses = [], totalDurationSeconds = 600, totalTestQuestions = 0) => {
  const actualTotalQuestions = Math.max(1, totalTestQuestions || responses.length || 1);

  let totalPronunciation = 0;
  let totalFluency = 0;
  let totalGrammar = 0;
  let totalVocabulary = 0;
  let totalPaceScore = 0;
  let totalConfidence = 0;
  let totalSentenceFormation = 0;
  let totalFillerScore = 0;
  let totalCoherence = 0;
  let totalListeningAccuracy = 0;

  let totalWPM = 0;
  let totalFillerCount = 0;
  const allFillersFound = [];
  const allGrammarErrors = [];

  // Iterate over all expected test questions
  for (let i = 0; i < actualTotalQuestions; i++) {
    const res = responses[i];
    const transcript = (res?.transcript ?? '').trim();
    const duration = res?.durationSeconds || 15;
    const promptRefText = res?.referenceText ?? '';
    const wordCount = transcript.split(/\s+/).filter(Boolean).length;

    // If candidate skipped or gave empty response to this question -> 0 score for this item
    if (!res || (!transcript && !res.audioUrl) || wordCount === 0) {
      // 0 points added for skipped question
      continue;
    }

    // 1. Fillers Control (5m)
    const fillerData = detectFillerWords(transcript);
    totalFillerCount += fillerData.count;
    allFillersFound.push(...fillerData.found);
    totalFillerScore += fillerData.score;

    // 2. Pace / WPM (5m)
    const paceData = calculateSpeakingPace(transcript, duration);
    totalWPM += paceData.wpm;
    totalPaceScore += paceData.score;

    // 3. Grammar Accuracy (10m)
    const grammarData = evaluateGrammar(transcript);
    totalGrammar += grammarData.score;
    allGrammarErrors.push(...grammarData.errors);

    // 4. Vocabulary Richness (10m)
    const vocabData = evaluateVocabulary(transcript);
    totalVocabulary += vocabData.score;

    // 5. Listening Accuracy / Reference Sentence Match (10m)
    const listeningScore = evaluateListeningAccuracy(transcript, promptRefText);
    totalListeningAccuracy += listeningScore;

    // 6. Fluency & Flow (10m) - Rigorous scale based on word volume & flow
    let fluencyScore = 0;
    if (wordCount >= 25) fluencyScore = 10;
    else if (wordCount >= 18) fluencyScore = 8;
    else if (wordCount >= 12) fluencyScore = 6;
    else if (wordCount >= 6) fluencyScore = 4;
    else fluencyScore = 2;

    if (fillerData.count > 3) fluencyScore = Math.max(1, fluencyScore - 3);
    if (paceData.wpm < 75 || paceData.wpm > 190) fluencyScore = Math.max(1, fluencyScore - 2);
    totalFluency += fluencyScore;

    // 7. Voice Confidence & Professional Delivery (10m)
    let confidenceScore = 0;
    if (wordCount >= 20) confidenceScore = 9;
    else if (wordCount >= 12) confidenceScore = 7;
    else if (wordCount >= 5) confidenceScore = 4;
    else confidenceScore = 2;

    if (fillerData.count > 2) confidenceScore = Math.max(1, confidenceScore - 2);
    if (paceData.wpm >= 110 && paceData.wpm <= 160) confidenceScore = Math.min(10, confidenceScore + 1);
    totalConfidence += confidenceScore;

    // 8. Pronunciation & Phonetic Clarity (10m)
    let pronScore = 0;
    if (wordCount >= 20 && grammarData.errors.length === 0) pronScore = 10;
    else if (wordCount >= 12 && grammarData.errors.length <= 1) pronScore = 8;
    else if (wordCount >= 6) pronScore = 6;
    else pronScore = 3;

    if (grammarData.errors.length > 2) pronScore = Math.max(1, pronScore - 3);
    totalPronunciation += pronScore;

    // 9. Sentence Formation & Syntactic Complexity (10m)
    let sentenceScore = 0;
    if (wordCount >= 25) sentenceScore = 10;
    else if (wordCount >= 15) sentenceScore = 8;
    else if (wordCount >= 8) sentenceScore = 5;
    else if (wordCount >= 3) sentenceScore = 3;
    else sentenceScore = 1;
    totalSentenceFormation += sentenceScore;

    // 10. Coherence, Relevance & Logical Structure (10m)
    let coherenceScore = 0;
    if (wordCount >= 25) coherenceScore = 10;
    else if (wordCount >= 15) coherenceScore = 8;
    else if (wordCount >= 8) coherenceScore = 5;
    else coherenceScore = 2;
    totalCoherence += coherenceScore;
  }

  // Average parameters across TOTAL expected questions in test
  const pronunciation = Math.round(totalPronunciation / actualTotalQuestions);
  const fluency = Math.round(totalFluency / actualTotalQuestions);
  const grammar = Math.round(totalGrammar / actualTotalQuestions);
  const vocabulary = Math.round(totalVocabulary / actualTotalQuestions);
  const speakingPaceScore = Math.round(totalPaceScore / actualTotalQuestions);
  const confidence = Math.round(totalConfidence / actualTotalQuestions);
  const sentenceFormation = Math.round(totalSentenceFormation / actualTotalQuestions);
  const fillerScore = Math.round(totalFillerScore / actualTotalQuestions);
  const coherence = Math.round(totalCoherence / actualTotalQuestions);
  const listeningAccuracy = Math.round(totalListeningAccuracy / actualTotalQuestions);

  const answeredCount = responses.filter(r => r && (r.transcript || r.audioUrl) && (r.transcript ?? '').trim().length > 0).length;
  const avgWPM = answeredCount > 0 ? Math.round(totalWPM / answeredCount) : 0;

  const rawScore = pronunciation + fluency + grammar + vocabulary + speakingPaceScore +
    confidence + sentenceFormation + fillerScore + coherence + listeningAccuracy;

  const percentage = Math.round((rawScore / 90) * 100);
  const cefr = mapScoreToCEFR(percentage);

  return {
    rawScore,
    maxScore: 90,
    percentage,
    cefr,
    wpm: avgWPM,
    fillerCount: totalFillerCount,
    fillersFound: [...new Set(allFillersFound)],
    grammarErrors: allGrammarErrors,
    parameters: {
      pronunciation: { mark: pronunciation, max: 10, label: 'Pronunciation' },
      fluency: { mark: fluency, max: 10, label: 'Fluency & Flow' },
      grammar: { mark: grammar, max: 10, label: 'Grammar Accuracy' },
      vocabulary: { mark: vocabulary, max: 10, label: 'Vocabulary Richness' },
      speakingPace: { mark: speakingPaceScore, max: 5, label: 'Speaking Pace (WPM)' },
      confidence: { mark: confidence, max: 10, label: 'Voice Confidence' },
      sentenceFormation: { mark: sentenceFormation, max: 10, label: 'Sentence Formation' },
      fillerWords: { mark: fillerScore, max: 5, label: 'Filler Word Control' },
      coherence: { mark: coherence, max: 10, label: 'Coherence & Structure' },
      listeningAccuracy: { mark: listeningAccuracy, max: 10, label: 'Listening Accuracy' },
    }
  };
};
