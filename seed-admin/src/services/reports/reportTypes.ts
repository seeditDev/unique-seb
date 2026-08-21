/** ─── SEED-IT Report Engine Types ──────────────────────────────────────────── */

export interface NormalizedSection {
  name: string;
  score: number;
  maxScore: number;
  percentage: number;
  timeTaken: string;
  timeTakenSeconds: number;
  status: "Pass" | "Fail";
  cefrLevel?: string | undefined;
  wpm?: number | undefined;
  fillerCount?: number | undefined;
}

export interface NormalizedQuestion {
  index: number;
  questionText: string;
  topic: string;
  tags: string[];
  isCorrect: boolean;
  selectedAnswer: string;
  correctAnswer: string;
  timeTakenSeconds: number;
  timeTaken: string;
  difficulty: string;
  marks: number;
}

export interface NormalizedCodingSubmission {
  questionNumber: number;
  problemTitle: string;
  language: string;
  timeComplexity: string;
  spaceComplexity: string;
  testsPassed: number;
  totalTests: number;
  score: number;
  maxMarks: number;
  accuracy: number;
  timeTakenSeconds: number;
  timeTaken: string;
  difficulty: string;
  attempted: boolean;
  code: string;
  submittedAt?: number | undefined;
}

export interface NormalizedResult {
  userId:      string;   // Firebase Auth UID
  rollNumber:  string;
  name:        string;
  email:       string;
  college:     string;
  department:  string;
  year:        string;
  cohortId:    string;
  tenantId:    string;

  assessmentId:    string;
  assessmentTitle: string;
  assessmentType:  string;
  assessmentVersion?: number;

  startedAt:        string;
  submittedAt:      string;
  submittedAtDate:  Date | null;
  timeTakenSeconds: number;

  totalScore: number;
  maxScore:   number;
  percentage: number;
  passed:     boolean;

  status: "PASS" | "FAIL";

  autoSubmitted:    boolean;
  submissionReason: string;
  violationCount:   number;

  sections:          NormalizedSection[];
  questions:         NormalizedQuestion[];
  codingSubmissions: NormalizedCodingSubmission[];

  cefrLevel:   string;
  cefrName:    string;

  // Extended analytics fields
  studentId?:      string;
  partialScore?:   number;
  fullScore?:      number;
  initialScore?:   number;
  violationTime?:  number;
  correctAnswers?: number;
  totalQuestions?: number;
  readinessCategory?: string;
  readinessPkg?:   string;
  category?:       string;
  insight?:        string;
  wpm:         number;
  fillerCount: number;
}

export interface TagStat {
  tag: string;
  correct: number;
  total: number;
  accuracy: number;
  avgTimeSeconds: number;
}

export interface AssessmentGroup {
  id: string;
  assessmentTitle: string;
  title: string;
  type: string;
  results: NormalizedResult[];
  sections: NormalizedSection[];
  totalSubmissions: number;
  avgPercentage: number;
  passRate: number;
  colleges: Set<string>;
  depts: Set<string>;
  years: Set<string>;
}

export interface ReportFilters {
  assessmentTitle?: string;
  college?: string;
  year?: string;
  passThreshold?: number;
}
