// Copyright 2026 jem-sec-attest contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Training page — full training workflow UI with states: loading-session, no-profile,
 * start, curriculum, module-learning, module-scenario, module-quiz, evaluating, result, error.
 * T019: Training page UI and on-mount session hydration.
 * T020: User interactions driving the full training workflow.
 * Constitution VI: All user-facing strings are centralised in STRINGS for i18n readiness.
 */

"use client";

import type React from "react";
import { use, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// String catalog — Constitution VI i18n requirement
// ---------------------------------------------------------------------------

const STRINGS = {
  pageTitle: "Security Training",
  loadingSession: "Loading your training session...",
  noProfile: "You need to complete your role profile before starting training.",
  goToIntake: "Complete Role Profile",
  startDescription:
    "Complete your security training to demonstrate compliance with your organisation's security policies.",
  startButton: "Start Training",
  startingSession: "Creating your training session...",
  curriculumTitle: "Your Training Curriculum",
  curriculumSubtitle: "Work through each module in order to complete your training.",
  progressLabel: (scored: number, total: number) => `${scored} of ${total} modules completed`,
  moduleStatusLocked: "Locked",
  moduleStatusInProgress: "In Progress",
  moduleStatusScored: "Scored",
  moduleStatusComplete: "Complete",
  startModule: "Click to begin this module",
  loadingContent: "Generating module content...",
  continueToScenarios: "Continue to Scenarios",
  scenarioProgress: (current: number, total: number) => `Scenario ${current} of ${total}`,
  submitScenario: "Submit Answer",
  submittingScenario: "Submitting...",
  scenarioScoreLabel: "Your score:",
  scenarioRationaleLabel: "Feedback:",
  nextScenario: "Next Scenario",
  proceedToQuiz: "Proceed to Quiz",
  quizTitle: "Module Quiz",
  quizSubtitle: "Answer all questions below, then submit.",
  submitQuiz: "Submit Quiz",
  submittingQuiz: "Submitting quiz...",
  moduleScoreLabel: "Module score:",
  nextModule: "Continue to Next Module",
  evaluatingTitle: "Evaluating Your Training",
  evaluatingMessage: "Computing your final score...",
  resultTitle: "Training Complete",
  resultPassLabel: "PASSED",
  resultFailLabel: "FAILED",
  resultExhaustedLabel: "ATTEMPTS EXHAUSTED",
  resultAbandonedLabel: "TRAINING ABANDONED",
  resultScoreLabel: "Your aggregate score:",
  resultModuleBreakdown: "Module Breakdown",
  resultModuleScore: (title: string) => `Score for ${title}`,
  remediationHint:
    "You did not pass this attempt. If remediation is available, contact your administrator to begin remediation training.",
  exhaustedMessage:
    "You have used all available attempts. Please contact your administrator for assistance.",
  abandonedMessage:
    "This training session was abandoned. Please contact your administrator to restart.",
  errorTitle: "Something went wrong",
  retryButton: "Try Again",
  freeTextPlaceholder: "Type your answer here...",
  freeTextLabel: "Your answer",
  // Progress sidebar (T031)
  progressSidebarTitle: "Your Progress",
  progressOverall: (pct: number) => `${pct}% complete`,
  progressAttempt: (n: number) => `Attempt ${n}`,
  progressModuleLocked: "Locked",
  progressModuleInProgress: "In Progress",
  progressModuleScored: (pct: number) => `${pct}%`,
  // History view (T031)
  viewHistoryButton: "View Training History",
  backToResultButton: "Back to Result",
  historyTitle: "Training History",
  historyLoadingMessage: "Loading history...",
  historyEmptyMessage: "No previous training sessions found.",
  historyAttemptLabel: (n: number) => `Attempt ${n}`,
  historyDateLabel: "Date:",
  historyScoreLabel: "Score:",
  historyStatusLabel: "Status:",
  historyModulesLabel: "Module Breakdown",
  historyErrorMessage: "Failed to load training history. Please try again.",
  // Abandon training (T033)
  abandonButton: "Abandon Training",
  abandonConfirm: "Are you sure? This counts toward your 3-attempt limit.",
  abandoningSession: "Abandoning...",
  // Sidebar accessibility labels (T031)
  progressModuleInProgressLabel: "In progress",
  progressModuleLockedLabel: "Locked",
  progressModuleCompletedScoreLabel: (pct: number) => `Completed, score: ${pct}%`,
  progressModuleCompletedNoScoreLabel: "Completed, score: N/A",
  // Fallback error messages (shown via setError → renderError)
  errorLoadSession:
    "Unable to load your training session. Please check your connection and try again.",
  errorStartTraining: "Failed to start training. Please try again.",
  errorLoadModuleContent: "Failed to load module content. Please try again.",
  errorSubmitAnswer: "Failed to submit answer. Please try again.",
  errorSubmitQuiz: "Failed to submit quiz. Please try again.",
  errorEvaluateTraining: "Failed to evaluate training. Please try again.",
  errorStartRemediation: "Failed to start remediation. Please try again.",
  errorAbandonTraining: "Failed to abandon training. Please try again.",
  // Result badge decorative symbols
  resultPassSymbol: "✓",
  resultFailSymbol: "✗",
  // Date fallback
  historyDateFallback: "—",
  // Optimistic concurrency conflict (T027)
  conflictBanner: "Your training was updated in another tab. Refreshing...",
  // Remediation UI (T023)
  failedReviewTitle: "Training Result",
  failedReviewSubtitle: "You did not pass this attempt.",
  attemptCounter: (current: number, max: number) => `Attempt ${current} of ${max}`,
  weakAreasLabel: "Areas needing improvement:",
  startRemediation: "Start Remediation Training",
  startingRemediation: "Starting remediation...",
  contactAdminMessage:
    "You have used all available attempts. Please contact your administrator for assistance.",
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageState =
  | "loading-session"
  | "no-profile"
  | "start"
  | "curriculum"
  | "module-learning"
  | "module-scenario"
  | "module-quiz"
  | "evaluating"
  | "result"
  | "failed-review"
  | "history"
  | "error";

type SessionStatus =
  | "curriculum-generating"
  | "in-progress"
  | "evaluating"
  | "passed"
  | "failed"
  | "in-remediation"
  | "exhausted"
  | "abandoned";

type ModuleStatus =
  | "locked"
  | "content-generating"
  | "learning"
  | "scenario-active"
  | "quiz-active"
  | "scored";

interface McOptionClient {
  key: string;
  text: string;
}

interface ScenarioClient {
  id: string;
  narrative: string;
  responseType: "multiple-choice" | "free-text";
  options?: McOptionClient[];
}

interface QuizQuestionClient {
  id: string;
  text: string;
  responseType: "multiple-choice" | "free-text";
  options?: McOptionClient[];
}

interface ModuleContentClient {
  instruction: string;
  scenarios: ScenarioClient[];
  quiz: { questions: QuizQuestionClient[] };
  generatedAt: string;
}

interface ModuleSummary {
  id: string;
  moduleIndex: number;
  title: string;
  topicArea: string;
  status: ModuleStatus;
  content: ModuleContentClient | null;
  scenarioResponses: ScenarioResponseResult[];
  quizAnswers: QuizAnswerResult[];
  moduleScore: number | null;
}

interface ScenarioResponseResult {
  scenarioId: string;
  score: number;
  llmRationale?: string;
}

interface QuizAnswerResult {
  questionId: string;
  score: number;
}

interface TrainingSessionResponse {
  id: string;
  status: SessionStatus;
  attemptNumber: number;
  aggregateScore: number | null;
  curriculum: { modules: Array<{ title: string; topicArea: string }> };
  createdAt?: string;
}

interface HistoryEntry {
  session: TrainingSessionResponse;
  modules: ModuleSummary[];
}

// ---------------------------------------------------------------------------
// Pure helper — exported for unit testing
// ---------------------------------------------------------------------------

export function derivePageState(
  session: TrainingSessionResponse | null,
  modules: ModuleSummary[],
): PageState {
  if (session === null) return "start";

  const { status } = session;

  if (status === "evaluating") return "evaluating";
  if (status === "failed") return "failed-review";
  if (status === "passed" || status === "exhausted" || status === "abandoned") return "result";

  // in-progress (or curriculum-generating treated as in-progress for UI)
  const learning = modules.find((m) => m.status === "learning");
  if (learning) return "module-learning";

  const scenarioActive = modules.find((m) => m.status === "scenario-active");
  if (scenarioActive) return "module-scenario";

  const quizActive = modules.find((m) => m.status === "quiz-active");
  if (quizActive) return "module-quiz";

  const contentGenerating = modules.find((m) => m.status === "content-generating");
  if (contentGenerating) return "module-learning";

  return "curriculum";
}

// ---------------------------------------------------------------------------
// Shared inline style objects
// ---------------------------------------------------------------------------

const styles = {
  container: {
    maxWidth: "800px",
    margin: "2rem auto",
    padding: "0 1rem",
    fontFamily: "system-ui, sans-serif",
  },
  heading: {
    fontSize: "1.5rem",
    fontWeight: 600,
    marginBottom: "0.5rem",
    color: "#111",
  },
  subheading: {
    fontSize: "1.125rem",
    fontWeight: 600,
    marginBottom: "0.5rem",
    color: "#111",
  },
  paragraph: {
    color: "#555",
    marginBottom: "1.25rem",
    lineHeight: 1.6,
  },
  primaryButton: {
    padding: "0.65rem 1.5rem",
    backgroundColor: "#1a73e8",
    color: "white",
    border: "none",
    borderRadius: "4px",
    fontSize: "0.95rem",
    fontWeight: 500,
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "0.65rem 1.5rem",
    backgroundColor: "#f5f5f5",
    color: "#111",
    border: "1px solid #ddd",
    borderRadius: "4px",
    fontSize: "0.95rem",
    fontWeight: 500,
    cursor: "pointer",
  },
  card: {
    border: "1px solid #e0e0e0",
    borderRadius: "6px",
    padding: "1.25rem",
    marginBottom: "1rem",
    backgroundColor: "#fafafa",
  },
  moduleCard: {
    border: "1px solid #e0e0e0",
    borderRadius: "6px",
    padding: "1rem 1.25rem",
    marginBottom: "0.75rem",
    backgroundColor: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  moduleCardLocked: {
    border: "1px solid #e0e0e0",
    borderRadius: "6px",
    padding: "1rem 1.25rem",
    marginBottom: "0.75rem",
    backgroundColor: "#f9f9f9",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    opacity: 0.7,
  },
  progressBar: {
    height: "8px",
    backgroundColor: "#e0e0e0",
    borderRadius: "4px",
    marginBottom: "1.5rem",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#1a73e8",
    borderRadius: "4px",
    transition: "width 0.3s ease",
  },
  statusBadge: {
    fontSize: "0.75rem",
    fontWeight: 600,
    padding: "0.2rem 0.5rem",
    borderRadius: "3px",
  },
  instructionBox: {
    backgroundColor: "#f0f4ff",
    border: "1px solid #c7d7f5",
    borderRadius: "6px",
    padding: "1.25rem",
    marginBottom: "1.5rem",
    lineHeight: 1.7,
  },
  radioLabel: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.5rem",
    marginBottom: "0.5rem",
    cursor: "pointer",
    fontSize: "0.95rem",
    color: "#222",
  },
  textarea: {
    width: "100%",
    minHeight: "120px",
    padding: "0.75rem",
    border: "1px solid #ccc",
    borderRadius: "4px",
    fontSize: "0.95rem",
    fontFamily: "system-ui, sans-serif",
    resize: "vertical",
    boxSizing: "border-box" as const,
  },
  resultBadge: (pass: unknown): React.CSSProperties => ({
    display: "inline-block",
    padding: "0.35rem 1rem",
    borderRadius: "4px",
    fontWeight: 700,
    fontSize: "1rem",
    backgroundColor: pass ? "#dcfce7" : "#fee2e2",
    color: pass ? "#166534" : "#991b1b",
    marginBottom: "1rem",
  }),
  scoreDisplay: {
    fontSize: "2rem",
    fontWeight: 700,
    color: "#111",
    marginBottom: "0.5rem",
  },
  errorHeading: {
    fontSize: "1.5rem",
    fontWeight: 600,
    marginBottom: "0.5rem",
    color: "#b91c1c",
  },
  infoMessage: {
    padding: "0.75rem 1rem",
    backgroundColor: "#fff8e1",
    border: "1px solid #f9a825",
    borderRadius: "4px",
    marginBottom: "1rem",
    fontSize: "0.9rem",
    color: "#5f4c00",
  },
  layoutWithSidebar: {
    display: "flex",
    gap: "2rem",
    alignItems: "flex-start",
  },
  mainContent: {
    flex: 1,
    minWidth: 0,
  },
  sidebar: {
    width: "220px",
    flexShrink: 0,
    border: "1px solid #e0e0e0",
    borderRadius: "6px",
    padding: "1rem",
    backgroundColor: "#fafafa",
  },
  sidebarHeading: {
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "#111",
    marginBottom: "0.75rem",
  },
  sidebarModuleRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.5rem",
    fontSize: "0.8rem",
    color: "#555",
  },
  sidebarProgressText: {
    fontSize: "0.8rem",
    color: "#555",
    marginBottom: "0.5rem",
  },
} satisfies Record<string, React.CSSProperties | ((...args: unknown[]) => React.CSSProperties)>;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingSpinner({ light = false }: { light?: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: "16px",
          height: "16px",
          border: `2px solid ${light ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.15)"}`,
          borderTopColor: light ? "white" : "#1a73e8",
          borderRadius: "50%",
          animation: "spin 0.7s linear infinite",
          verticalAlign: "middle",
          marginRight: "0.5rem",
        }}
      />
      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
    </>
  );
}

function ModuleStatusBadge({ status }: { status: ModuleStatus }) {
  const config: Record<ModuleStatus, { label: string; bg: string; color: string }> = {
    locked: { label: STRINGS.moduleStatusLocked, bg: "#f3f4f6", color: "#6b7280" },
    "content-generating": {
      label: STRINGS.moduleStatusInProgress,
      bg: "#dbeafe",
      color: "#1e40af",
    },
    learning: { label: STRINGS.moduleStatusInProgress, bg: "#dbeafe", color: "#1e40af" },
    "scenario-active": {
      label: STRINGS.moduleStatusInProgress,
      bg: "#dbeafe",
      color: "#1e40af",
    },
    "quiz-active": { label: STRINGS.moduleStatusInProgress, bg: "#dbeafe", color: "#1e40af" },
    scored: { label: STRINGS.moduleStatusComplete, bg: "#dcfce7", color: "#166534" },
  };
  const { label, bg, color } = config[status];
  return (
    <span
      style={{ ...(styles.statusBadge as React.CSSProperties), backgroundColor: bg, color }}
      aria-label={`Status: ${label}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TrainingPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = use(params);

  const [pageState, setPageState] = useState<PageState>("loading-session");
  const [session, setSession] = useState<TrainingSessionResponse | null>(null);
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [activeModuleIndex, setActiveModuleIndex] = useState<number>(0);
  const [scenarioIndex, setScenarioIndex] = useState<number>(0);
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [freeTextAnswer, setFreeTextAnswer] = useState<string>("");
  const [quizAnswers, setQuizAnswers] = useState<
    Record<string, { option?: string; text?: string }>
  >({});
  const [lastScenarioResult, setLastScenarioResult] = useState<{
    score: number;
    rationale?: string;
  } | null>(null);
  const [lastQuizResult, setLastQuizResult] = useState<{
    moduleScore: number;
    answers: QuizAnswerResult[];
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [conflictMessage, setConflictMessage] = useState("");
  // T023: track the outcome of the last evaluate call for the failed-review UI
  const [evaluateNextAction, setEvaluateNextAction] = useState<
    "complete" | "remediation-available" | "exhausted" | null
  >(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [maxAttempts] = useState<number>(3);
  const firstFocusRef = useRef<HTMLButtonElement | HTMLAnchorElement | null>(null);

  // Focus management on state change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs on pageState change to move focus
  useEffect(() => {
    if (firstFocusRef.current) {
      firstFocusRef.current.focus();
    }
  }, [pageState]);

  // -------------------------------------------------------------------------
  // On mount: fetch session state
  // -------------------------------------------------------------------------

  // biome-ignore lint/correctness/useExhaustiveDependencies: evaluateNextAction intentionally excluded — this effect runs on mount/tenant change only
  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const res = await fetch(`/api/training/${tenant}/session`);
        if (cancelled) return;

        if (res.status === 404) {
          // No session — check if profile exists
          const profileRes = await fetch(`/api/intake/${tenant}/profile`);
          if (cancelled) return;
          if (profileRes.ok) {
            setPageState("start");
          } else {
            setPageState("no-profile");
          }
          return;
        }

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(body.message ?? `Unexpected error (${res.status})`);
        }

        const data = (await res.json()) as {
          session: TrainingSessionResponse;
          modules: ModuleSummary[];
        };

        setSession(data.session);
        setModules(data.modules);

        const derived = derivePageState(data.session, data.modules);
        setPageState(derived);

        // Restore active module index from in-progress modules
        if (
          derived === "module-learning" ||
          derived === "module-scenario" ||
          derived === "module-quiz"
        ) {
          const activeStatuses: ModuleStatus[] = [
            "learning",
            "content-generating",
            "scenario-active",
            "quiz-active",
          ];
          const activeIdx = data.modules.findIndex((m) => activeStatuses.includes(m.status));
          if (activeIdx !== -1) {
            setActiveModuleIndex(activeIdx);

            const activeModule = data.modules[activeIdx];

            // T026: For scenario-active modules, restore scenario index from
            // the count of already-answered scenarios
            if (activeModule?.status === "scenario-active") {
              setScenarioIndex(activeModule.scenarioResponses.length);
            }

            // T026: For content-generating modules, auto-retry content generation
            if (activeModule?.status === "content-generating") {
              handleStartModule(activeIdx, () => cancelled);
            }
          }
        }

        // Auto-trigger evaluate if session is in evaluating state
        if (derived === "evaluating") {
          triggerEvaluate(tenant);
        }

        // T023: For failed sessions loaded on mount, assume remediation may be available.
        // The server will return 409 if remediation is not enabled or attempts are exhausted.
        if (derived === "failed-review" && evaluateNextAction === null) {
          setEvaluateNextAction("remediation-available");
        }
      } catch {
        if (!cancelled) {
          setError(STRINGS.errorLoadSession);
          setPageState("error");
        }
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
    // triggerEvaluate and evaluateNextAction are intentionally excluded from deps:
    // this effect runs only on mount/tenant change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  // -------------------------------------------------------------------------
  // T027: Refresh session state after a 409 conflict
  // -------------------------------------------------------------------------

  async function refreshSession() {
    setConflictMessage(STRINGS.conflictBanner);
    try {
      const res = await fetch(`/api/training/${tenant}/session`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        session: TrainingSessionResponse;
        modules: ModuleSummary[];
      };
      setSession(data.session);
      setModules(data.modules);
      const derived = derivePageState(data.session, data.modules);
      setPageState(derived);

      const activeStatuses: ModuleStatus[] = [
        "learning",
        "content-generating",
        "scenario-active",
        "quiz-active",
      ];
      const activeIdx = data.modules.findIndex((m) => activeStatuses.includes(m.status));
      if (activeIdx !== -1) {
        setActiveModuleIndex(activeIdx);
        const activeModule = data.modules[activeIdx];
        if (activeModule?.status === "scenario-active") {
          setScenarioIndex(activeModule.scenarioResponses.length);
        }
      }
    } finally {
      setConflictMessage("");
    }
  }

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  async function handleStartTraining() {
    setIsSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/training/${tenant}/session`, { method: "POST" });
      if (res.status === 409) {
        await refreshSession();
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Server error (${res.status})`);
      }
      const data = (await res.json()) as {
        session: TrainingSessionResponse;
        modules: ModuleSummary[];
      };
      setSession(data.session);
      setModules(data.modules);
      setActiveModuleIndex(0);
      setPageState("curriculum");
    } catch (err) {
      setError(err instanceof Error ? err.message : STRINGS.errorStartTraining);
      setPageState("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStartModule(moduleIndex: number, isCancelled?: () => boolean) {
    setIsSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/training/${tenant}/module/${moduleIndex}/content`, {
        method: "POST",
      });
      if (isCancelled?.()) return;
      if (res.status === 409) {
        await refreshSession();
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        if (isCancelled?.()) return;
        throw new Error(body.message ?? `Server error (${res.status})`);
      }
      const updatedModule = (await res.json()) as ModuleSummary;
      if (isCancelled?.()) return;
      setModules((prev) => prev.map((m) => (m.moduleIndex === moduleIndex ? updatedModule : m)));
      setActiveModuleIndex(moduleIndex);
      setScenarioIndex(0);
      setLastScenarioResult(null);
      setPageState("module-learning");
    } catch (err) {
      if (isCancelled?.()) return;
      setError(err instanceof Error ? err.message : STRINGS.errorLoadModuleContent);
      setPageState("error");
    } finally {
      if (!isCancelled?.()) {
        setIsSubmitting(false);
      }
    }
  }

  function handleContinueToScenarios() {
    setScenarioIndex(0);
    setSelectedOption("");
    setFreeTextAnswer("");
    setLastScenarioResult(null);
    setPageState("module-scenario");
  }

  async function handleSubmitScenario() {
    const activeModule = modules[activeModuleIndex];
    if (!activeModule?.content) return;

    const scenario = activeModule.content.scenarios[scenarioIndex];
    if (!scenario) return;

    setIsSubmitting(true);
    setError("");

    try {
      const body: Record<string, unknown> = {
        scenarioId: scenario.id,
        responseType: scenario.responseType,
      };
      if (scenario.responseType === "multiple-choice") {
        body.selectedOption = selectedOption;
      } else {
        body.freeTextResponse = freeTextAnswer;
      }

      const res = await fetch(`/api/training/${tenant}/module/${activeModuleIndex}/scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 409) {
        await refreshSession();
        return;
      }

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errBody.message ?? `Server error (${res.status})`);
      }

      const result = (await res.json()) as {
        score: number;
        rationale?: string;
        module: ModuleSummary;
      };

      setLastScenarioResult({ score: result.score, rationale: result.rationale });
      setModules((prev) =>
        prev.map((m) => (m.moduleIndex === activeModuleIndex ? result.module : m)),
      );
      setSelectedOption("");
      setFreeTextAnswer("");
    } catch (err) {
      setError(err instanceof Error ? err.message : STRINGS.errorSubmitAnswer);
      setPageState("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleNextScenario() {
    const activeModule = modules[activeModuleIndex];
    if (!activeModule?.content) return;

    const total = activeModule.content.scenarios.length;
    const next = scenarioIndex + 1;

    setLastScenarioResult(null);
    setSelectedOption("");
    setFreeTextAnswer("");

    if (next < total) {
      setScenarioIndex(next);
    } else {
      setScenarioIndex(0);
      setPageState("module-quiz");
    }
  }

  async function handleSubmitQuiz() {
    const activeModule = modules[activeModuleIndex];
    if (!activeModule?.content) return;

    setIsSubmitting(true);
    setError("");

    try {
      const answers = activeModule.content.quiz.questions.map((q) => {
        const ans = quizAnswers[q.id] ?? {};
        return {
          questionId: q.id,
          responseType: q.responseType,
          ...(q.responseType === "multiple-choice"
            ? { selectedOption: ans.option ?? "" }
            : { freeTextResponse: ans.text ?? "" }),
        };
      });

      const res = await fetch(`/api/training/${tenant}/module/${activeModuleIndex}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });

      if (res.status === 409) {
        await refreshSession();
        return;
      }

      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errBody.message ?? `Server error (${res.status})`);
      }

      const result = (await res.json()) as {
        moduleScore: number;
        answers: QuizAnswerResult[];
        module: ModuleSummary;
      };

      setLastQuizResult({ moduleScore: result.moduleScore, answers: result.answers });
      setModules((prev) =>
        prev.map((m) => (m.moduleIndex === activeModuleIndex ? result.module : m)),
      );
      setQuizAnswers({});
    } catch (err) {
      setError(err instanceof Error ? err.message : STRINGS.errorSubmitQuiz);
      setPageState("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleNextModuleOrEvaluate() {
    setLastQuizResult(null);
    setLastScenarioResult(null);

    const nextIndex = activeModuleIndex + 1;
    if (nextIndex < modules.length) {
      setActiveModuleIndex(nextIndex);
      setPageState("curriculum");
    } else {
      await triggerEvaluate(tenant);
    }
  }

  async function triggerEvaluate(tenantSlug: string) {
    setPageState("evaluating");
    try {
      const res = await fetch(`/api/training/${tenantSlug}/evaluate`, { method: "POST" });
      if (res.status === 409) {
        await refreshSession();
        return;
      }
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errBody.message ?? `Server error (${res.status})`);
      }
      const result = (await res.json()) as {
        sessionId: string;
        aggregateScore: number;
        passed: boolean;
        attemptNumber: number;
        weakAreas?: string[];
        nextAction: "complete" | "remediation-available" | "exhausted";
      };

      // Update session state to reflect evaluation outcome
      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: result.passed
                ? "passed"
                : result.nextAction === "exhausted"
                  ? "exhausted"
                  : "failed",
              aggregateScore: result.aggregateScore,
            }
          : prev,
      );

      setEvaluateNextAction(result.nextAction);

      // T023: Route to failed-review when remediation is available; otherwise result
      if (result.nextAction === "remediation-available") {
        setPageState("failed-review");
      } else {
        setPageState("result");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : STRINGS.errorEvaluateTraining);
      setPageState("error");
    }
  }

  // T023: Start remediation by calling the same POST /session endpoint
  async function handleStartRemediation() {
    setIsSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/training/${tenant}/session`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Server error (${res.status})`);
      }
      const data = (await res.json()) as {
        session: TrainingSessionResponse;
        modules: ModuleSummary[];
      };
      setSession(data.session);
      setModules(data.modules);
      setActiveModuleIndex(0);
      setEvaluateNextAction(null);
      setPageState("curriculum");
    } catch (err) {
      setError(err instanceof Error ? err.message : STRINGS.errorStartRemediation);
      setPageState("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleRetry() {
    setError("");
    setPageState(session ? "curriculum" : "start");
  }

  async function handleAbandonTraining() {
    const confirmed = window.confirm(STRINGS.abandonConfirm);
    if (!confirmed) return;

    setIsSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/training/${tenant}/abandon`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Server error (${res.status})`);
      }
      const data = (await res.json()) as { session: TrainingSessionResponse };
      setSession(data.session);
      setPageState("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : STRINGS.errorAbandonTraining);
      setPageState("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleViewHistory() {
    setIsLoadingHistory(true);
    setError("");
    try {
      const res = await fetch(`/api/training/${tenant}/session?history=true`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Server error (${res.status})`);
      }
      const data = (await res.json()) as HistoryEntry[];
      setHistory(data);
      setPageState("history");
    } catch {
      setError(STRINGS.historyErrorMessage);
      setPageState("error");
    } finally {
      setIsLoadingHistory(false);
    }
  }

  function handleBackToResult() {
    setPageState("result");
  }

  // -------------------------------------------------------------------------
  // Render helpers — T031: progress sidebar and history view
  // -------------------------------------------------------------------------

  function renderProgressSidebar() {
    if (!session || modules.length === 0) return null;
    const scoredCount = modules.filter((m) => m.status === "scored").length;
    const total = modules.length;
    const progressPct = total > 0 ? Math.round((scoredCount / total) * 100) : 0;
    return (
      <aside
        aria-label={STRINGS.progressSidebarTitle}
        style={styles.sidebar as React.CSSProperties}
      >
        <div style={styles.sidebarHeading as React.CSSProperties}>
          {STRINGS.progressSidebarTitle}
        </div>
        <p style={styles.sidebarProgressText as React.CSSProperties}>
          {STRINGS.progressOverall(progressPct)}
        </p>
        <p style={styles.sidebarProgressText as React.CSSProperties}>
          {STRINGS.progressAttempt(session.attemptNumber)}
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {modules.map((mod) => {
            let indicator: React.ReactNode;
            if (mod.status === "scored") {
              const pct = mod.moduleScore != null ? Math.round(mod.moduleScore * 100) : null;
              indicator = (
                <span
                  style={{ color: "#166534", fontWeight: 600 }}
                  aria-label={
                    pct != null
                      ? STRINGS.progressModuleCompletedScoreLabel(pct)
                      : STRINGS.progressModuleCompletedNoScoreLabel
                  }
                >
                  {pct != null ? STRINGS.progressModuleScored(pct) : STRINGS.moduleStatusComplete}
                </span>
              );
            } else if (
              mod.status === "learning" ||
              mod.status === "content-generating" ||
              mod.status === "scenario-active" ||
              mod.status === "quiz-active"
            ) {
              indicator = (
                <span
                  style={{ color: "#1e40af", display: "flex", alignItems: "center" }}
                  aria-label={STRINGS.progressModuleInProgressLabel}
                >
                  <LoadingSpinner />
                </span>
              );
            } else {
              indicator = (
                <span style={{ color: "#9ca3af" }} aria-label={STRINGS.progressModuleLockedLabel}>
                  {STRINGS.progressModuleLocked}
                </span>
              );
            }
            return (
              <li key={mod.id} style={styles.sidebarModuleRow as React.CSSProperties}>
                <div
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={mod.title}
                >
                  {mod.title}
                </div>
                <div>{indicator}</div>
              </li>
            );
          })}
        </ul>
      </aside>
    );
  }

  function renderHistory() {
    return (
      <section aria-labelledby="history-heading">
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
          <h1 id="history-heading" style={styles.heading as React.CSSProperties}>
            {STRINGS.historyTitle}
          </h1>
          <button
            type="button"
            ref={firstFocusRef as React.RefObject<HTMLButtonElement>}
            onClick={handleBackToResult}
            style={styles.secondaryButton as React.CSSProperties}
          >
            {STRINGS.backToResultButton}
          </button>
        </div>
        {isLoadingHistory ? (
          <div aria-live="polite" aria-busy="true" style={{ padding: "1rem 0" }}>
            <p style={styles.paragraph as React.CSSProperties}>
              <LoadingSpinner />
              {STRINGS.historyLoadingMessage}
            </p>
          </div>
        ) : history.length === 0 ? (
          <p style={styles.paragraph as React.CSSProperties}>{STRINGS.historyEmptyMessage}</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {history.map((entry) => {
              const { session: sess, modules: sessMods } = entry;
              const isPassed = sess.status === "passed";
              const pct =
                sess.aggregateScore != null ? Math.round(sess.aggregateScore * 100) : null;
              const dateStr = sess.createdAt
                ? new Date(sess.createdAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : STRINGS.historyDateFallback;
              return (
                <li key={sess.id} style={styles.card as React.CSSProperties}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "0.75rem",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: "#111", marginBottom: "0.25rem" }}>
                        {STRINGS.historyAttemptLabel(sess.attemptNumber)}
                      </div>
                      <div style={{ fontSize: "0.875rem", color: "#555" }}>
                        {STRINGS.historyDateLabel} {dateStr}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.2rem 0.6rem",
                          borderRadius: "3px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          backgroundColor: isPassed ? "#dcfce7" : "#fee2e2",
                          color: isPassed ? "#166534" : "#991b1b",
                          marginBottom: "0.25rem",
                        }}
                        aria-label={`Status: ${sess.status}`}
                      >
                        {sess.status.toUpperCase()}
                      </span>
                      {pct != null && (
                        <div style={{ fontSize: "0.875rem", color: "#555" }}>
                          {STRINGS.historyScoreLabel} {pct}%
                        </div>
                      )}
                    </div>
                  </div>
                  {sessMods.length > 0 && (
                    <details>
                      <summary
                        style={{
                          cursor: "pointer",
                          fontSize: "0.875rem",
                          color: "#1a73e8",
                          marginBottom: "0.5rem",
                        }}
                      >
                        {STRINGS.historyModulesLabel}
                      </summary>
                      <ul style={{ listStyle: "none", padding: "0.5rem 0 0 0", margin: 0 }}>
                        {sessMods.map((mod) => (
                          <li
                            key={mod.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: "0.875rem",
                              color: "#555",
                              padding: "0.25rem 0",
                              borderTop: "1px solid #f0f0f0",
                            }}
                          >
                            <span>{mod.title}</span>
                            <span style={{ fontWeight: 600, color: "#111" }}>
                              {mod.moduleScore != null
                                ? `${Math.round(mod.moduleScore * 100)}%`
                                : "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  // -------------------------------------------------------------------------
  // Render helpers — existing
  // -------------------------------------------------------------------------

  function renderLoadingSession() {
    return (
      <div aria-live="polite" aria-busy="true" style={{ padding: "2rem 0", textAlign: "center" }}>
        <p style={styles.paragraph as React.CSSProperties}>
          <LoadingSpinner />
          {STRINGS.loadingSession}
        </p>
      </div>
    );
  }

  function renderNoProfile() {
    return (
      <section aria-labelledby="no-profile-heading">
        <h1 id="no-profile-heading" style={styles.heading as React.CSSProperties}>
          {STRINGS.pageTitle}
        </h1>
        <p style={styles.paragraph as React.CSSProperties}>{STRINGS.noProfile}</p>
        <a
          href={`/${tenant}/intake`}
          ref={firstFocusRef as React.RefObject<HTMLAnchorElement>}
          style={{
            ...(styles.primaryButton as React.CSSProperties),
            display: "inline-block",
            textDecoration: "none",
          }}
        >
          {STRINGS.goToIntake}
        </a>
      </section>
    );
  }

  function renderStart() {
    return (
      <section aria-labelledby="start-heading">
        <h1 id="start-heading" style={styles.heading as React.CSSProperties}>
          {STRINGS.pageTitle}
        </h1>
        <p style={styles.paragraph as React.CSSProperties}>{STRINGS.startDescription}</p>
        <button
          type="button"
          onClick={handleStartTraining}
          disabled={isSubmitting}
          ref={firstFocusRef as React.RefObject<HTMLButtonElement>}
          style={{
            ...(styles.primaryButton as React.CSSProperties),
            opacity: isSubmitting ? 0.7 : 1,
            cursor: isSubmitting ? "not-allowed" : "pointer",
          }}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <LoadingSpinner light />
              {STRINGS.startingSession}
            </>
          ) : (
            STRINGS.startButton
          )}
        </button>
      </section>
    );
  }

  function renderCurriculum() {
    const scoredCount = modules.filter((m) => m.status === "scored").length;
    const total = modules.length;
    const progressPct = total > 0 ? (scoredCount / total) * 100 : 0;

    // First module that is not scored and not locked (resuming), else first locked
    const firstUnlocked = modules.find((m) => m.status !== "locked" && m.status !== "scored");
    const nextLocked = modules.find((m) => m.status === "locked");
    const clickableModule = firstUnlocked ?? nextLocked;

    return (
      <section aria-labelledby="curriculum-heading">
        <h1 id="curriculum-heading" style={styles.heading as React.CSSProperties}>
          {STRINGS.curriculumTitle}
        </h1>
        <p style={styles.paragraph as React.CSSProperties}>{STRINGS.curriculumSubtitle}</p>

        {/* biome-ignore lint/a11y/useFocusableInteractive: progressbar is a read-only display widget; keyboard focus is not required */}
        <div
          style={styles.progressBar as React.CSSProperties}
          role="progressbar"
          aria-valuenow={scoredCount}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={STRINGS.progressLabel(scoredCount, total)}
        >
          <div
            style={{
              ...(styles.progressFill as React.CSSProperties),
              width: `${progressPct}%`,
            }}
          />
        </div>
        <p style={{ fontSize: "0.875rem", color: "#555", marginBottom: "1rem" }}>
          {STRINGS.progressLabel(scoredCount, total)}
        </p>

        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {modules.map((mod) => {
            const isClickable = mod === clickableModule && mod.status !== "scored";
            const cardStyle = isClickable
              ? (styles.moduleCard as React.CSSProperties)
              : (styles.moduleCardLocked as React.CSSProperties);

            return (
              <li key={mod.id}>
                {isClickable ? (
                  <button
                    type="button"
                    style={{ ...cardStyle, width: "100%", textAlign: "left", background: "white" }}
                    aria-label={`${mod.title} — ${STRINGS.startModule}`}
                    onClick={() => handleStartModule(mod.moduleIndex)}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: "#111", marginBottom: "0.25rem" }}>
                        {mod.title}
                      </div>
                      <div style={{ fontSize: "0.875rem", color: "#555" }}>{mod.topicArea}</div>
                    </div>
                    <ModuleStatusBadge status={mod.status} />
                  </button>
                ) : (
                  <div style={cardStyle} aria-disabled="true">
                    <div>
                      <div style={{ fontWeight: 600, color: "#111", marginBottom: "0.25rem" }}>
                        {mod.title}
                      </div>
                      <div style={{ fontSize: "0.875rem", color: "#555" }}>{mod.topicArea}</div>
                    </div>
                    <ModuleStatusBadge status={mod.status} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div style={{ marginTop: "1.5rem", borderTop: "1px solid #e0e0e0", paddingTop: "1rem" }}>
          <button
            type="button"
            onClick={handleAbandonTraining}
            disabled={isSubmitting}
            style={{
              ...(styles.secondaryButton as React.CSSProperties),
              color: "#b91c1c",
              borderColor: "#fca5a5",
              opacity: isSubmitting ? 0.7 : 1,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? STRINGS.abandoningSession : STRINGS.abandonButton}
          </button>
        </div>
      </section>
    );
  }

  function renderModuleLearning() {
    const activeModule = modules[activeModuleIndex];
    if (!activeModule) return null;

    const isGenerating = activeModule.status === "content-generating" || !activeModule.content;

    return (
      <section aria-labelledby="learning-heading">
        <h1 id="learning-heading" style={styles.heading as React.CSSProperties}>
          {activeModule.title}
        </h1>
        <p style={{ fontSize: "0.875rem", color: "#555", marginBottom: "1rem" }}>
          {activeModule.topicArea}
        </p>

        {isGenerating ? (
          <div aria-live="polite" aria-busy="true" style={styles.card as React.CSSProperties}>
            <p style={{ color: "#555", margin: 0 }}>
              <LoadingSpinner />
              {STRINGS.loadingContent}
            </p>
          </div>
        ) : (
          <>
            <div
              style={styles.instructionBox as React.CSSProperties}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: server-sanitized HTML
              dangerouslySetInnerHTML={{ __html: activeModule.content?.instruction ?? "" }}
            />
            <button
              type="button"
              ref={firstFocusRef as React.RefObject<HTMLButtonElement>}
              onClick={handleContinueToScenarios}
              style={styles.primaryButton as React.CSSProperties}
            >
              {STRINGS.continueToScenarios}
            </button>
          </>
        )}

        <div style={{ marginTop: "1.5rem", borderTop: "1px solid #e0e0e0", paddingTop: "1rem" }}>
          <button
            type="button"
            onClick={handleAbandonTraining}
            disabled={isSubmitting}
            style={{
              ...(styles.secondaryButton as React.CSSProperties),
              color: "#b91c1c",
              borderColor: "#fca5a5",
              opacity: isSubmitting ? 0.7 : 1,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? STRINGS.abandoningSession : STRINGS.abandonButton}
          </button>
        </div>
      </section>
    );
  }

  function renderModuleScenario() {
    const activeModule = modules[activeModuleIndex];
    if (!activeModule?.content) return null;

    const scenarios = activeModule.content.scenarios;
    const scenario = scenarios[scenarioIndex];
    if (!scenario) return null;

    const total = scenarios.length;

    return (
      <section aria-labelledby="scenario-heading">
        <h1 id="scenario-heading" style={styles.heading as React.CSSProperties}>
          {activeModule.title}
        </h1>
        <p style={{ fontSize: "0.875rem", color: "#555", marginBottom: "1rem" }}>
          {STRINGS.scenarioProgress(scenarioIndex + 1, total)}
        </p>

        {lastScenarioResult ? (
          <div
            aria-live="polite"
            style={{
              ...(styles.card as React.CSSProperties),
              borderColor: lastScenarioResult.score >= 0.7 ? "#86efac" : "#fca5a5",
              backgroundColor: lastScenarioResult.score >= 0.7 ? "#f0fdf4" : "#fef2f2",
            }}
          >
            <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
              {STRINGS.scenarioScoreLabel} {Math.round(lastScenarioResult.score * 100)}%
            </p>
            {lastScenarioResult.rationale && (
              <p style={{ color: "#333", margin: 0 }}>
                <strong>{STRINGS.scenarioRationaleLabel}</strong> {lastScenarioResult.rationale}
              </p>
            )}
            <div style={{ marginTop: "1rem" }}>
              <button
                type="button"
                ref={firstFocusRef as React.RefObject<HTMLButtonElement>}
                onClick={handleNextScenario}
                style={styles.primaryButton as React.CSSProperties}
              >
                {scenarioIndex + 1 < total ? STRINGS.nextScenario : STRINGS.proceedToQuiz}
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmitScenario();
            }}
            aria-labelledby="scenario-heading"
          >
            <fieldset style={{ border: "none", padding: 0, margin: "0 0 1.5rem 0" }}>
              <legend
                style={{
                  fontWeight: 500,
                  marginBottom: "0.75rem",
                  fontSize: "1rem",
                  color: "#111",
                }}
              >
                {scenario.narrative}
              </legend>

              {scenario.responseType === "multiple-choice" && scenario.options ? (
                <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
                  <legend style={{ display: "none" }}>{scenario.narrative}</legend>
                  {scenario.options.map((opt) => (
                    <label key={opt.key} style={styles.radioLabel as React.CSSProperties}>
                      <input
                        type="radio"
                        name="scenario-option"
                        value={opt.key}
                        checked={selectedOption === opt.key}
                        onChange={() => setSelectedOption(opt.key)}
                        aria-label={opt.text}
                      />
                      <span>
                        <strong>{opt.key}.</strong> {opt.text}
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : (
                <div>
                  <label
                    htmlFor="scenario-free-text"
                    style={{ display: "block", fontWeight: 500, marginBottom: "0.5rem" }}
                  >
                    {STRINGS.freeTextLabel}
                  </label>
                  <textarea
                    id="scenario-free-text"
                    value={freeTextAnswer}
                    onChange={(e) => setFreeTextAnswer(e.target.value)}
                    maxLength={2000}
                    placeholder={STRINGS.freeTextPlaceholder}
                    style={styles.textarea as React.CSSProperties}
                    aria-required="true"
                  />
                </div>
              )}
            </fieldset>

            <button
              type="submit"
              disabled={
                isSubmitting ||
                (scenario.responseType === "multiple-choice"
                  ? !selectedOption
                  : !freeTextAnswer.trim())
              }
              style={{
                ...(styles.primaryButton as React.CSSProperties),
                opacity:
                  isSubmitting ||
                  (scenario.responseType === "multiple-choice"
                    ? !selectedOption
                    : !freeTextAnswer.trim())
                    ? 0.6
                    : 1,
                cursor:
                  isSubmitting ||
                  (scenario.responseType === "multiple-choice"
                    ? !selectedOption
                    : !freeTextAnswer.trim())
                    ? "not-allowed"
                    : "pointer",
              }}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner light />
                  {STRINGS.submittingScenario}
                </>
              ) : (
                STRINGS.submitScenario
              )}
            </button>
          </form>
        )}

        <div style={{ marginTop: "1.5rem", borderTop: "1px solid #e0e0e0", paddingTop: "1rem" }}>
          <button
            type="button"
            onClick={handleAbandonTraining}
            disabled={isSubmitting}
            style={{
              ...(styles.secondaryButton as React.CSSProperties),
              color: "#b91c1c",
              borderColor: "#fca5a5",
              opacity: isSubmitting ? 0.7 : 1,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? STRINGS.abandoningSession : STRINGS.abandonButton}
          </button>
        </div>
      </section>
    );
  }

  function renderModuleQuiz() {
    const activeModule = modules[activeModuleIndex];
    if (!activeModule?.content) return null;

    const questions = activeModule.content.quiz.questions;

    return (
      <section aria-labelledby="quiz-heading">
        <h1 id="quiz-heading" style={styles.heading as React.CSSProperties}>
          {STRINGS.quizTitle}
        </h1>
        <p style={{ fontSize: "0.875rem", color: "#555", marginBottom: "0.5rem" }}>
          {activeModule.title}
        </p>

        {lastQuizResult ? (
          <div aria-live="polite" style={styles.card as React.CSSProperties}>
            <p style={{ fontWeight: 600, marginBottom: "1rem" }}>
              {STRINGS.moduleScoreLabel} {Math.round(lastQuizResult.moduleScore * 100)}%
            </p>
            <button
              type="button"
              ref={firstFocusRef as React.RefObject<HTMLButtonElement>}
              onClick={handleNextModuleOrEvaluate}
              style={styles.primaryButton as React.CSSProperties}
            >
              {activeModuleIndex + 1 < modules.length ? STRINGS.nextModule : STRINGS.submitQuiz}
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmitQuiz();
            }}
            aria-labelledby="quiz-heading"
          >
            <p style={styles.paragraph as React.CSSProperties}>{STRINGS.quizSubtitle}</p>

            {questions.map((q, qi) => (
              <fieldset
                key={q.id}
                style={{
                  border: "1px solid #e0e0e0",
                  borderRadius: "6px",
                  padding: "1rem",
                  marginBottom: "1rem",
                }}
              >
                <legend style={{ fontWeight: 500, fontSize: "0.95rem", padding: "0 0.5rem" }}>
                  {qi + 1}. {q.text}
                </legend>

                {q.responseType === "multiple-choice" && q.options ? (
                  <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
                    <legend style={{ display: "none" }}>{q.text}</legend>
                    {q.options.map((opt) => (
                      <label key={opt.key} style={styles.radioLabel as React.CSSProperties}>
                        <input
                          type="radio"
                          name={`quiz-q-${q.id}`}
                          value={opt.key}
                          checked={(quizAnswers[q.id]?.option ?? "") === opt.key}
                          onChange={() =>
                            setQuizAnswers((prev) => ({
                              ...prev,
                              [q.id]: { ...prev[q.id], option: opt.key },
                            }))
                          }
                          aria-label={opt.text}
                        />
                        <span>
                          <strong>{opt.key}.</strong> {opt.text}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <div>
                    <label
                      htmlFor={`quiz-free-text-${q.id}`}
                      style={{
                        display: "block",
                        fontWeight: 500,
                        marginBottom: "0.5rem",
                        fontSize: "0.875rem",
                      }}
                    >
                      {STRINGS.freeTextLabel}
                    </label>
                    <textarea
                      id={`quiz-free-text-${q.id}`}
                      value={quizAnswers[q.id]?.text ?? ""}
                      onChange={(e) =>
                        setQuizAnswers((prev) => ({
                          ...prev,
                          [q.id]: { ...prev[q.id], text: e.target.value },
                        }))
                      }
                      maxLength={2000}
                      placeholder={STRINGS.freeTextPlaceholder}
                      style={styles.textarea as React.CSSProperties}
                      aria-required="true"
                    />
                  </div>
                )}
              </fieldset>
            ))}

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                ...(styles.primaryButton as React.CSSProperties),
                opacity: isSubmitting ? 0.7 : 1,
                cursor: isSubmitting ? "not-allowed" : "pointer",
              }}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner light />
                  {STRINGS.submittingQuiz}
                </>
              ) : (
                STRINGS.submitQuiz
              )}
            </button>
          </form>
        )}

        <div style={{ marginTop: "1.5rem", borderTop: "1px solid #e0e0e0", paddingTop: "1rem" }}>
          <button
            type="button"
            onClick={handleAbandonTraining}
            disabled={isSubmitting}
            style={{
              ...(styles.secondaryButton as React.CSSProperties),
              color: "#b91c1c",
              borderColor: "#fca5a5",
              opacity: isSubmitting ? 0.7 : 1,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? STRINGS.abandoningSession : STRINGS.abandonButton}
          </button>
        </div>
      </section>
    );
  }

  function renderEvaluating() {
    return (
      <div aria-live="polite" aria-busy="true" style={{ padding: "2rem 0", textAlign: "center" }}>
        <h1 style={styles.heading as React.CSSProperties}>{STRINGS.evaluatingTitle}</h1>
        <p style={styles.paragraph as React.CSSProperties}>
          <LoadingSpinner />
          {STRINGS.evaluatingMessage}
        </p>
      </div>
    );
  }

  function renderResult() {
    if (!session) return null;

    const { status, aggregateScore } = session;
    const isPassed = status === "passed";
    const isExhausted = status === "exhausted";
    const isAbandoned = status === "abandoned";
    const scorePct = aggregateScore != null ? Math.round(aggregateScore * 100) : null;

    let statusLabel: string;
    if (isPassed) statusLabel = STRINGS.resultPassLabel;
    else if (isExhausted) statusLabel = STRINGS.resultExhaustedLabel;
    else if (isAbandoned) statusLabel = STRINGS.resultAbandonedLabel;
    else statusLabel = STRINGS.resultFailLabel;

    return (
      <section aria-labelledby="result-heading" aria-live="polite">
        <h1 id="result-heading" style={styles.heading as React.CSSProperties}>
          {STRINGS.resultTitle}
        </h1>

        <div>
          <span style={styles.resultBadge(isPassed)} aria-label={`Result: ${statusLabel}`}>
            {isPassed ? STRINGS.resultPassSymbol : STRINGS.resultFailSymbol} {statusLabel}
          </span>
        </div>

        {scorePct != null && (
          <div
            style={styles.scoreDisplay as React.CSSProperties}
            aria-label={`${STRINGS.resultScoreLabel} ${scorePct}%`}
          >
            {scorePct}%
            <span
              style={{ fontSize: "1rem", fontWeight: 400, color: "#555", marginLeft: "0.5rem" }}
            >
              {STRINGS.resultScoreLabel}
            </span>
          </div>
        )}

        {!isPassed && !isExhausted && !isAbandoned && (
          <div style={styles.infoMessage as React.CSSProperties} role="note">
            {STRINGS.remediationHint}
          </div>
        )}

        {isExhausted && (
          <div style={styles.infoMessage as React.CSSProperties} role="note">
            {STRINGS.exhaustedMessage}
          </div>
        )}

        {isAbandoned && (
          <div style={styles.infoMessage as React.CSSProperties} role="note">
            {STRINGS.abandonedMessage}
          </div>
        )}

        {modules.length > 0 && (
          <section aria-labelledby="module-breakdown-heading" style={{ marginTop: "2rem" }}>
            <h2 id="module-breakdown-heading" style={styles.subheading as React.CSSProperties}>
              {STRINGS.resultModuleBreakdown}
            </h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {modules.map((mod) => (
                <li key={mod.id} style={styles.card as React.CSSProperties}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: "#111" }}>{mod.title}</div>
                      <div style={{ fontSize: "0.875rem", color: "#555" }}>{mod.topicArea}</div>
                    </div>
                    {mod.moduleScore != null && (
                      <span
                        style={{ fontWeight: 600, fontSize: "1rem", color: "#111" }}
                        aria-label={STRINGS.resultModuleScore(mod.title)}
                      >
                        {Math.round(mod.moduleScore * 100)}%
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* T031: View History button */}
        <div style={{ marginTop: "1.5rem" }}>
          <button
            type="button"
            onClick={handleViewHistory}
            disabled={isLoadingHistory}
            style={{
              ...(styles.secondaryButton as React.CSSProperties),
              opacity: isLoadingHistory ? 0.7 : 1,
              cursor: isLoadingHistory ? "not-allowed" : "pointer",
            }}
            aria-busy={isLoadingHistory}
          >
            {isLoadingHistory ? (
              <>
                <LoadingSpinner />
                {STRINGS.historyLoadingMessage}
              </>
            ) : (
              STRINGS.viewHistoryButton
            )}
          </button>
        </div>
      </section>
    );
  }

  // T023: Render failed-review state — shows result with optional remediation button
  function renderFailedReview() {
    if (!session) return null;

    const { aggregateScore, attemptNumber } = session;
    const scorePct = aggregateScore != null ? Math.round(aggregateScore * 100) : null;
    const canRemediate = evaluateNextAction === "remediation-available";

    return (
      <section aria-labelledby="failed-review-heading" aria-live="polite">
        <h1 id="failed-review-heading" style={styles.heading as React.CSSProperties}>
          {STRINGS.failedReviewTitle}
        </h1>

        <div>
          <span style={styles.resultBadge(false)} aria-label={`Result: ${STRINGS.resultFailLabel}`}>
            {STRINGS.resultFailSymbol} {STRINGS.resultFailLabel}
          </span>
        </div>

        <p style={{ fontSize: "0.875rem", color: "#555", marginBottom: "1rem" }}>
          {STRINGS.failedReviewSubtitle}
        </p>

        {scorePct != null && (
          <div
            style={styles.scoreDisplay as React.CSSProperties}
            aria-label={`${STRINGS.resultScoreLabel} ${scorePct}%`}
          >
            {scorePct}%
            <span
              style={{ fontSize: "1rem", fontWeight: 400, color: "#555", marginLeft: "0.5rem" }}
            >
              {STRINGS.resultScoreLabel}
            </span>
          </div>
        )}

        {modules.length > 0 && (
          <section
            aria-labelledby="failed-module-breakdown-heading"
            style={{ marginTop: "1.5rem" }}
          >
            <h2
              id="failed-module-breakdown-heading"
              style={styles.subheading as React.CSSProperties}
            >
              {STRINGS.resultModuleBreakdown}
            </h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {modules.map((mod) => {
                const modPct = mod.moduleScore != null ? Math.round(mod.moduleScore * 100) : null;
                const isWeak = modPct != null && modPct < 70;
                return (
                  <li
                    key={mod.id}
                    style={{
                      ...(styles.card as React.CSSProperties),
                      borderColor: isWeak ? "#fca5a5" : "#e0e0e0",
                      backgroundColor: isWeak ? "#fef2f2" : "#fafafa",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: "#111" }}>{mod.title}</div>
                        <div style={{ fontSize: "0.875rem", color: "#555" }}>{mod.topicArea}</div>
                        {isWeak && (
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "#991b1b",
                              marginTop: "0.25rem",
                              fontWeight: 500,
                            }}
                          >
                            {STRINGS.weakAreasLabel.replace(":", "")}
                          </div>
                        )}
                      </div>
                      {modPct != null && (
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: "1rem",
                            color: isWeak ? "#991b1b" : "#111",
                          }}
                          aria-label={STRINGS.resultModuleScore(mod.title)}
                        >
                          {modPct}%
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div style={{ marginTop: "1.5rem" }}>
          {canRemediate ? (
            <button
              type="button"
              ref={firstFocusRef as React.RefObject<HTMLButtonElement>}
              onClick={handleStartRemediation}
              disabled={isSubmitting}
              style={{
                ...(styles.primaryButton as React.CSSProperties),
                opacity: isSubmitting ? 0.7 : 1,
                cursor: isSubmitting ? "not-allowed" : "pointer",
              }}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner light />
                  {STRINGS.startingRemediation}
                </>
              ) : (
                STRINGS.startRemediation
              )}
            </button>
          ) : (
            <div style={styles.infoMessage as React.CSSProperties} role="note">
              {STRINGS.contactAdminMessage}
            </div>
          )}
        </div>

        <p
          style={{ fontSize: "0.875rem", color: "#777", marginTop: "0.75rem" }}
          aria-label={STRINGS.attemptCounter(attemptNumber, maxAttempts)}
        >
          {STRINGS.attemptCounter(attemptNumber, maxAttempts)}
        </p>
      </section>
    );
  }

  function renderError() {
    return (
      <section aria-labelledby="error-heading" aria-live="assertive">
        <h1 id="error-heading" style={styles.errorHeading as React.CSSProperties}>
          {STRINGS.errorTitle}
        </h1>
        <p style={{ color: "#333", marginBottom: "1.5rem" }}>{error}</p>
        <button
          type="button"
          ref={firstFocusRef as React.RefObject<HTMLButtonElement>}
          onClick={handleRetry}
          style={styles.primaryButton as React.CSSProperties}
        >
          {STRINGS.retryButton}
        </button>
      </section>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <main style={styles.container as React.CSSProperties}>
      {conflictMessage && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "#fff3cd",
            border: "1px solid #ffc107",
            borderRadius: "4px",
            marginBottom: "1rem",
            fontSize: "0.9rem",
            color: "#856404",
          }}
        >
          <LoadingSpinner />
          {conflictMessage}
        </div>
      )}
      {pageState === "loading-session" && renderLoadingSession()}
      {pageState === "no-profile" && renderNoProfile()}
      {pageState === "start" && renderStart()}
      {(pageState === "curriculum" ||
        pageState === "module-learning" ||
        pageState === "module-scenario" ||
        pageState === "module-quiz") && (
        <div style={styles.layoutWithSidebar as React.CSSProperties}>
          <div style={styles.mainContent as React.CSSProperties}>
            {pageState === "curriculum" && renderCurriculum()}
            {pageState === "module-learning" && renderModuleLearning()}
            {pageState === "module-scenario" && renderModuleScenario()}
            {pageState === "module-quiz" && renderModuleQuiz()}
          </div>
          {renderProgressSidebar()}
        </div>
      )}
      {pageState === "evaluating" && renderEvaluating()}
      {pageState === "result" && renderResult()}
      {pageState === "failed-review" && renderFailedReview()}
      {pageState === "history" && renderHistory()}
      {pageState === "error" && renderError()}
    </main>
  );
}
