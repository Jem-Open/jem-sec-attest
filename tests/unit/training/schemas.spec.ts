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

import {
  CurriculumOutlineModuleSchema,
  CurriculumOutlineSchema,
  FreeTextEvaluationSchema,
  McOptionClientSchema,
  McOptionSchema,
  ModuleContentClientSchema,
  ModuleContentSchema,
  ModuleStatusSchema,
  QuizAnswerSchema,
  QuizQuestionClientSchema,
  QuizQuestionSchema,
  QuizSubmissionSchema,
  ResponseTypeSchema,
  ScenarioClientSchema,
  ScenarioResponseSchema,
  ScenarioSchema,
  ScenarioSubmissionSchema,
  SessionStatusSchema,
  TrainingModuleSchema,
  TrainingSessionSchema,
} from "@/training/schemas.js";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ISO = "2026-02-20T10:00:00.000Z";
const UUID = "123e4567-e89b-12d3-a456-426614174000";

function makeMcOption(overrides?: object) {
  return { key: "A", text: "Option A", correct: true, ...overrides };
}

function makeScenario(overrides?: object) {
  return {
    id: "sc-1",
    narrative: "A narrative.",
    responseType: "multiple-choice" as const,
    options: [makeMcOption()],
    ...overrides,
  };
}

function makeQuizQuestion(overrides?: object) {
  return {
    id: "q-1",
    text: "A question?",
    responseType: "multiple-choice" as const,
    options: [makeMcOption()],
    ...overrides,
  };
}

function makeModuleContent(overrides?: object) {
  return {
    instruction: "Read the following carefully.",
    scenarios: [makeScenario()],
    quiz: { questions: [makeQuizQuestion()] },
    generatedAt: ISO,
    ...overrides,
  };
}

function makeCurriculumOutlineModule(overrides?: object) {
  return {
    title: "Security Basics",
    topicArea: "Phishing",
    jobExpectationIndices: [0, 1],
    ...overrides,
  };
}

function makeCurriculumOutline(overrides?: object) {
  return {
    modules: [makeCurriculumOutlineModule()],
    generatedAt: ISO,
    ...overrides,
  };
}

function makeTrainingModule(overrides?: object) {
  return {
    id: UUID,
    tenantId: "tenant-1",
    sessionId: "session-1",
    moduleIndex: 0,
    title: "Module One",
    topicArea: "Phishing",
    jobExpectationIndices: [0],
    status: "locked" as const,
    content: null,
    scenarioResponses: [],
    quizAnswers: [],
    moduleScore: null,
    version: 1,
    createdAt: ISO,
    updatedAt: ISO,
    ...overrides,
  };
}

function makeTrainingSession(overrides?: object) {
  return {
    id: UUID,
    tenantId: "tenant-1",
    employeeId: "emp-1",
    roleProfileId: "rp-1",
    roleProfileVersion: 1,
    configHash: "abc123",
    appVersion: "1.0.0",
    status: "in-progress" as const,
    attemptNumber: 1,
    curriculum: makeCurriculumOutline(),
    aggregateScore: null,
    weakAreas: null,
    version: 1,
    createdAt: ISO,
    updatedAt: ISO,
    completedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SessionStatusSchema
// ---------------------------------------------------------------------------

describe("SessionStatusSchema", () => {
  const validValues = [
    "curriculum-generating",
    "in-progress",
    "evaluating",
    "passed",
    "failed",
    "in-remediation",
    "exhausted",
    "abandoned",
  ] as const;

  it.each(validValues)("accepts '%s'", (value) => {
    expect(SessionStatusSchema.safeParse(value).success).toBe(true);
  });

  it("rejects an unknown status string", () => {
    expect(SessionStatusSchema.safeParse("unknown-status").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(SessionStatusSchema.safeParse("").success).toBe(false);
  });

  it("rejects null", () => {
    expect(SessionStatusSchema.safeParse(null).success).toBe(false);
  });

  it("rejects number", () => {
    expect(SessionStatusSchema.safeParse(42).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ModuleStatusSchema
// ---------------------------------------------------------------------------

describe("ModuleStatusSchema", () => {
  const validValues = [
    "locked",
    "content-generating",
    "learning",
    "scenario-active",
    "quiz-active",
    "scored",
  ] as const;

  it.each(validValues)("accepts '%s'", (value) => {
    expect(ModuleStatusSchema.safeParse(value).success).toBe(true);
  });

  it("rejects an unknown module status", () => {
    expect(ModuleStatusSchema.safeParse("pending").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(ModuleStatusSchema.safeParse("").success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ResponseTypeSchema
// ---------------------------------------------------------------------------

describe("ResponseTypeSchema", () => {
  it("accepts 'multiple-choice'", () => {
    expect(ResponseTypeSchema.safeParse("multiple-choice").success).toBe(true);
  });

  it("accepts 'free-text'", () => {
    expect(ResponseTypeSchema.safeParse("free-text").success).toBe(true);
  });

  it("rejects 'text'", () => {
    expect(ResponseTypeSchema.safeParse("text").success).toBe(false);
  });

  it("rejects 'mc'", () => {
    expect(ResponseTypeSchema.safeParse("mc").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(ResponseTypeSchema.safeParse("").success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CurriculumOutlineModuleSchema
// ---------------------------------------------------------------------------

describe("CurriculumOutlineModuleSchema", () => {
  it("accepts a valid curriculum outline module", () => {
    const result = CurriculumOutlineModuleSchema.safeParse(makeCurriculumOutlineModule());
    expect(result.success).toBe(true);
  });

  it("accepts an empty jobExpectationIndices array", () => {
    const result = CurriculumOutlineModuleSchema.safeParse(
      makeCurriculumOutlineModule({ jobExpectationIndices: [] }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects missing title", () => {
    const { title: _, ...rest } = makeCurriculumOutlineModule();
    expect(CurriculumOutlineModuleSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing topicArea", () => {
    const { topicArea: _, ...rest } = makeCurriculumOutlineModule();
    expect(CurriculumOutlineModuleSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing jobExpectationIndices", () => {
    const { jobExpectationIndices: _, ...rest } = makeCurriculumOutlineModule();
    expect(CurriculumOutlineModuleSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects non-number elements in jobExpectationIndices", () => {
    const result = CurriculumOutlineModuleSchema.safeParse(
      makeCurriculumOutlineModule({ jobExpectationIndices: ["a", "b"] }),
    );
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CurriculumOutlineSchema
// ---------------------------------------------------------------------------

describe("CurriculumOutlineSchema", () => {
  it("accepts a valid curriculum outline", () => {
    expect(CurriculumOutlineSchema.safeParse(makeCurriculumOutline()).success).toBe(true);
  });

  it("accepts 8 modules (max)", () => {
    const modules = Array.from({ length: 8 }, () => makeCurriculumOutlineModule());
    expect(CurriculumOutlineSchema.safeParse(makeCurriculumOutline({ modules })).success).toBe(
      true,
    );
  });

  it("rejects empty modules array (min 1)", () => {
    expect(CurriculumOutlineSchema.safeParse(makeCurriculumOutline({ modules: [] })).success).toBe(
      false,
    );
  });

  it("rejects 9 modules (max is 8)", () => {
    const modules = Array.from({ length: 9 }, () => makeCurriculumOutlineModule());
    expect(CurriculumOutlineSchema.safeParse(makeCurriculumOutline({ modules })).success).toBe(
      false,
    );
  });

  it("rejects a non-datetime generatedAt", () => {
    expect(
      CurriculumOutlineSchema.safeParse(makeCurriculumOutline({ generatedAt: "not-a-date" }))
        .success,
    ).toBe(false);
  });

  it("rejects missing generatedAt", () => {
    const { generatedAt: _, ...rest } = makeCurriculumOutline();
    expect(CurriculumOutlineSchema.safeParse(rest).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// McOptionSchema
// ---------------------------------------------------------------------------

describe("McOptionSchema", () => {
  it("accepts a valid option", () => {
    expect(McOptionSchema.safeParse(makeMcOption()).success).toBe(true);
  });

  it("accepts correct: false", () => {
    expect(McOptionSchema.safeParse(makeMcOption({ correct: false })).success).toBe(true);
  });

  it("rejects missing key", () => {
    const { key: _, ...rest } = makeMcOption();
    expect(McOptionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing text", () => {
    const { text: _, ...rest } = makeMcOption();
    expect(McOptionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing correct", () => {
    const { correct: _, ...rest } = makeMcOption();
    expect(McOptionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects non-boolean correct", () => {
    expect(McOptionSchema.safeParse(makeMcOption({ correct: "yes" })).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ScenarioSchema
// ---------------------------------------------------------------------------

describe("ScenarioSchema", () => {
  it("accepts a valid multiple-choice scenario", () => {
    expect(ScenarioSchema.safeParse(makeScenario()).success).toBe(true);
  });

  it("accepts a valid free-text scenario with rubric", () => {
    const result = ScenarioSchema.safeParse(
      makeScenario({ responseType: "free-text", options: undefined, rubric: "Score by X." }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts a scenario with no options (optional field)", () => {
    const result = ScenarioSchema.safeParse(makeScenario({ options: undefined }));
    expect(result.success).toBe(true);
  });

  it("accepts a scenario with no rubric (optional field)", () => {
    const result = ScenarioSchema.safeParse(makeScenario({ rubric: undefined }));
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const { id: _, ...rest } = makeScenario();
    expect(ScenarioSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing narrative", () => {
    const { narrative: _, ...rest } = makeScenario();
    expect(ScenarioSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing responseType", () => {
    const { responseType: _, ...rest } = makeScenario();
    expect(ScenarioSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid responseType", () => {
    expect(ScenarioSchema.safeParse(makeScenario({ responseType: "short-answer" })).success).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// QuizQuestionSchema
// ---------------------------------------------------------------------------

describe("QuizQuestionSchema", () => {
  it("accepts a valid multiple-choice question", () => {
    expect(QuizQuestionSchema.safeParse(makeQuizQuestion()).success).toBe(true);
  });

  it("accepts a valid free-text question with rubric", () => {
    const result = QuizQuestionSchema.safeParse(
      makeQuizQuestion({ responseType: "free-text", options: undefined, rubric: "Grade by X." }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts a question with no options", () => {
    expect(QuizQuestionSchema.safeParse(makeQuizQuestion({ options: undefined })).success).toBe(
      true,
    );
  });

  it("rejects missing text", () => {
    const { text: _, ...rest } = makeQuizQuestion();
    expect(QuizQuestionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing id", () => {
    const { id: _, ...rest } = makeQuizQuestion();
    expect(QuizQuestionSchema.safeParse(rest).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ModuleContentSchema
// ---------------------------------------------------------------------------

describe("ModuleContentSchema", () => {
  it("accepts valid module content", () => {
    expect(ModuleContentSchema.safeParse(makeModuleContent()).success).toBe(true);
  });

  it("rejects empty instruction (min 1)", () => {
    expect(ModuleContentSchema.safeParse(makeModuleContent({ instruction: "" })).success).toBe(
      false,
    );
  });

  it("rejects empty scenarios array (min 1)", () => {
    expect(ModuleContentSchema.safeParse(makeModuleContent({ scenarios: [] })).success).toBe(false);
  });

  it("rejects empty quiz questions array (min 1)", () => {
    expect(
      ModuleContentSchema.safeParse(makeModuleContent({ quiz: { questions: [] } })).success,
    ).toBe(false);
  });

  it("rejects non-datetime generatedAt", () => {
    expect(ModuleContentSchema.safeParse(makeModuleContent({ generatedAt: "bad" })).success).toBe(
      false,
    );
  });

  it("accepts multiple scenarios and questions", () => {
    const result = ModuleContentSchema.safeParse(
      makeModuleContent({
        scenarios: [makeScenario(), makeScenario({ id: "sc-2" })],
        quiz: { questions: [makeQuizQuestion(), makeQuizQuestion({ id: "q-2" })] },
      }),
    );
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ScenarioResponseSchema
// ---------------------------------------------------------------------------

describe("ScenarioResponseSchema", () => {
  const validMcResponse = {
    scenarioId: "sc-1",
    responseType: "multiple-choice" as const,
    selectedOption: "A",
    score: 1,
    submittedAt: ISO,
  };

  const validFtResponse = {
    scenarioId: "sc-1",
    responseType: "free-text" as const,
    freeTextResponse: "My detailed answer.",
    score: 0.8,
    llmRationale: "Good explanation.",
    submittedAt: ISO,
  };

  it("accepts a valid multiple-choice response", () => {
    expect(ScenarioResponseSchema.safeParse(validMcResponse).success).toBe(true);
  });

  it("accepts a valid free-text response", () => {
    expect(ScenarioResponseSchema.safeParse(validFtResponse).success).toBe(true);
  });

  it("accepts score of exactly 0", () => {
    expect(ScenarioResponseSchema.safeParse({ ...validMcResponse, score: 0 }).success).toBe(true);
  });

  it("accepts score of exactly 1", () => {
    expect(ScenarioResponseSchema.safeParse({ ...validMcResponse, score: 1 }).success).toBe(true);
  });

  it("rejects score below 0", () => {
    expect(ScenarioResponseSchema.safeParse({ ...validMcResponse, score: -0.1 }).success).toBe(
      false,
    );
  });

  it("rejects score above 1", () => {
    expect(ScenarioResponseSchema.safeParse({ ...validMcResponse, score: 1.1 }).success).toBe(
      false,
    );
  });

  it("rejects freeTextResponse exceeding 2000 chars", () => {
    const result = ScenarioResponseSchema.safeParse({
      ...validFtResponse,
      freeTextResponse: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts freeTextResponse at exactly 2000 chars", () => {
    const result = ScenarioResponseSchema.safeParse({
      ...validFtResponse,
      freeTextResponse: "x".repeat(2000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing scenarioId", () => {
    const { scenarioId: _, ...rest } = validMcResponse;
    expect(ScenarioResponseSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing score", () => {
    const { score: _, ...rest } = validMcResponse;
    expect(ScenarioResponseSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects non-datetime submittedAt", () => {
    expect(
      ScenarioResponseSchema.safeParse({ ...validMcResponse, submittedAt: "today" }).success,
    ).toBe(false);
  });

  it("treats selectedOption as optional", () => {
    const { selectedOption: _, ...rest } = validMcResponse;
    expect(ScenarioResponseSchema.safeParse(rest).success).toBe(true);
  });

  it("treats llmRationale as optional", () => {
    expect(ScenarioResponseSchema.safeParse(validMcResponse).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// QuizAnswerSchema
// ---------------------------------------------------------------------------

describe("QuizAnswerSchema", () => {
  const validMcAnswer = {
    questionId: "q-1",
    responseType: "multiple-choice" as const,
    selectedOption: "B",
    score: 1,
    submittedAt: ISO,
  };

  const validFtAnswer = {
    questionId: "q-1",
    responseType: "free-text" as const,
    freeTextResponse: "My answer.",
    score: 0.5,
    llmRationale: "Partially correct.",
    submittedAt: ISO,
  };

  it("accepts a valid multiple-choice answer", () => {
    expect(QuizAnswerSchema.safeParse(validMcAnswer).success).toBe(true);
  });

  it("accepts a valid free-text answer", () => {
    expect(QuizAnswerSchema.safeParse(validFtAnswer).success).toBe(true);
  });

  it("accepts score 0", () => {
    expect(QuizAnswerSchema.safeParse({ ...validMcAnswer, score: 0 }).success).toBe(true);
  });

  it("rejects score above 1", () => {
    expect(QuizAnswerSchema.safeParse({ ...validMcAnswer, score: 1.5 }).success).toBe(false);
  });

  it("rejects freeTextResponse exceeding 2000 chars", () => {
    const result = QuizAnswerSchema.safeParse({
      ...validFtAnswer,
      freeTextResponse: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts freeTextResponse at exactly 2000 chars", () => {
    const result = QuizAnswerSchema.safeParse({
      ...validFtAnswer,
      freeTextResponse: "x".repeat(2000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing questionId", () => {
    const { questionId: _, ...rest } = validMcAnswer;
    expect(QuizAnswerSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects non-datetime submittedAt", () => {
    expect(
      QuizAnswerSchema.safeParse({ ...validMcAnswer, submittedAt: "not-a-date" }).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TrainingModuleSchema
// ---------------------------------------------------------------------------

describe("TrainingModuleSchema", () => {
  it("accepts a valid training module with null content", () => {
    expect(TrainingModuleSchema.safeParse(makeTrainingModule()).success).toBe(true);
  });

  it("accepts a valid training module with full content", () => {
    const result = TrainingModuleSchema.safeParse(
      makeTrainingModule({ status: "learning", content: makeModuleContent() }),
    );
    expect(result.success).toBe(true);
  });

  it("defaults scenarioResponses to [] when omitted", () => {
    const { scenarioResponses: _, ...rest } = makeTrainingModule();
    const result = TrainingModuleSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scenarioResponses).toEqual([]);
    }
  });

  it("defaults quizAnswers to [] when omitted", () => {
    const { quizAnswers: _, ...rest } = makeTrainingModule();
    const result = TrainingModuleSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quizAnswers).toEqual([]);
    }
  });

  it("rejects a non-uuid id", () => {
    expect(TrainingModuleSchema.safeParse(makeTrainingModule({ id: "not-a-uuid" })).success).toBe(
      false,
    );
  });

  it("rejects empty tenantId", () => {
    expect(TrainingModuleSchema.safeParse(makeTrainingModule({ tenantId: "" })).success).toBe(
      false,
    );
  });

  it("rejects empty sessionId", () => {
    expect(TrainingModuleSchema.safeParse(makeTrainingModule({ sessionId: "" })).success).toBe(
      false,
    );
  });

  it("rejects negative moduleIndex", () => {
    expect(TrainingModuleSchema.safeParse(makeTrainingModule({ moduleIndex: -1 })).success).toBe(
      false,
    );
  });

  it("accepts moduleIndex of 0 (boundary)", () => {
    expect(TrainingModuleSchema.safeParse(makeTrainingModule({ moduleIndex: 0 })).success).toBe(
      true,
    );
  });

  it("rejects fractional moduleIndex", () => {
    expect(TrainingModuleSchema.safeParse(makeTrainingModule({ moduleIndex: 1.5 })).success).toBe(
      false,
    );
  });

  it("rejects moduleScore below 0", () => {
    expect(TrainingModuleSchema.safeParse(makeTrainingModule({ moduleScore: -0.1 })).success).toBe(
      false,
    );
  });

  it("rejects moduleScore above 1", () => {
    expect(TrainingModuleSchema.safeParse(makeTrainingModule({ moduleScore: 1.1 })).success).toBe(
      false,
    );
  });

  it("accepts moduleScore of null", () => {
    expect(TrainingModuleSchema.safeParse(makeTrainingModule({ moduleScore: null })).success).toBe(
      true,
    );
  });

  it("accepts moduleScore between 0 and 1 inclusive", () => {
    expect(TrainingModuleSchema.safeParse(makeTrainingModule({ moduleScore: 0.75 })).success).toBe(
      true,
    );
  });

  it("rejects version of 0 (must be positive)", () => {
    expect(TrainingModuleSchema.safeParse(makeTrainingModule({ version: 0 })).success).toBe(false);
  });

  it("rejects fractional version", () => {
    expect(TrainingModuleSchema.safeParse(makeTrainingModule({ version: 1.5 })).success).toBe(
      false,
    );
  });

  it("rejects invalid status", () => {
    expect(TrainingModuleSchema.safeParse(makeTrainingModule({ status: "unknown" })).success).toBe(
      false,
    );
  });

  it("rejects non-datetime createdAt", () => {
    expect(
      TrainingModuleSchema.safeParse(makeTrainingModule({ createdAt: "bad-date" })).success,
    ).toBe(false);
  });

  it("rejects non-datetime updatedAt", () => {
    expect(
      TrainingModuleSchema.safeParse(makeTrainingModule({ updatedAt: "bad-date" })).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TrainingSessionSchema
// ---------------------------------------------------------------------------

describe("TrainingSessionSchema", () => {
  it("accepts a valid training session", () => {
    expect(TrainingSessionSchema.safeParse(makeTrainingSession()).success).toBe(true);
  });

  it("accepts completedAt as a valid datetime", () => {
    const result = TrainingSessionSchema.safeParse(
      makeTrainingSession({ completedAt: ISO, status: "passed" }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts completedAt as null", () => {
    expect(
      TrainingSessionSchema.safeParse(makeTrainingSession({ completedAt: null })).success,
    ).toBe(true);
  });

  it("rejects non-uuid id", () => {
    expect(TrainingSessionSchema.safeParse(makeTrainingSession({ id: "not-uuid" })).success).toBe(
      false,
    );
  });

  it("rejects empty tenantId", () => {
    expect(TrainingSessionSchema.safeParse(makeTrainingSession({ tenantId: "" })).success).toBe(
      false,
    );
  });

  it("rejects empty employeeId", () => {
    expect(TrainingSessionSchema.safeParse(makeTrainingSession({ employeeId: "" })).success).toBe(
      false,
    );
  });

  it("rejects empty roleProfileId", () => {
    expect(
      TrainingSessionSchema.safeParse(makeTrainingSession({ roleProfileId: "" })).success,
    ).toBe(false);
  });

  it("rejects roleProfileVersion of 0 (must be positive)", () => {
    expect(
      TrainingSessionSchema.safeParse(makeTrainingSession({ roleProfileVersion: 0 })).success,
    ).toBe(false);
  });

  it("rejects fractional roleProfileVersion", () => {
    expect(
      TrainingSessionSchema.safeParse(makeTrainingSession({ roleProfileVersion: 1.5 })).success,
    ).toBe(false);
  });

  it("rejects empty configHash", () => {
    expect(TrainingSessionSchema.safeParse(makeTrainingSession({ configHash: "" })).success).toBe(
      false,
    );
  });

  it("rejects empty appVersion", () => {
    expect(TrainingSessionSchema.safeParse(makeTrainingSession({ appVersion: "" })).success).toBe(
      false,
    );
  });

  it("rejects invalid status", () => {
    expect(
      TrainingSessionSchema.safeParse(makeTrainingSession({ status: "pending" })).success,
    ).toBe(false);
  });

  it("rejects attemptNumber of 0 (min is 1)", () => {
    expect(TrainingSessionSchema.safeParse(makeTrainingSession({ attemptNumber: 0 })).success).toBe(
      false,
    );
  });

  it("rejects attemptNumber of 4 (max is 3)", () => {
    expect(TrainingSessionSchema.safeParse(makeTrainingSession({ attemptNumber: 4 })).success).toBe(
      false,
    );
  });

  it("accepts attemptNumber of 1", () => {
    expect(TrainingSessionSchema.safeParse(makeTrainingSession({ attemptNumber: 1 })).success).toBe(
      true,
    );
  });

  it("accepts attemptNumber of 3", () => {
    expect(TrainingSessionSchema.safeParse(makeTrainingSession({ attemptNumber: 3 })).success).toBe(
      true,
    );
  });

  it("rejects fractional attemptNumber", () => {
    expect(
      TrainingSessionSchema.safeParse(makeTrainingSession({ attemptNumber: 1.5 })).success,
    ).toBe(false);
  });

  it("accepts aggregateScore of null", () => {
    expect(
      TrainingSessionSchema.safeParse(makeTrainingSession({ aggregateScore: null })).success,
    ).toBe(true);
  });

  it("rejects aggregateScore below 0", () => {
    expect(
      TrainingSessionSchema.safeParse(makeTrainingSession({ aggregateScore: -0.01 })).success,
    ).toBe(false);
  });

  it("rejects aggregateScore above 1", () => {
    expect(
      TrainingSessionSchema.safeParse(makeTrainingSession({ aggregateScore: 1.01 })).success,
    ).toBe(false);
  });

  it("accepts aggregateScore of 0 and 1 (boundaries)", () => {
    expect(
      TrainingSessionSchema.safeParse(makeTrainingSession({ aggregateScore: 0 })).success,
    ).toBe(true);
    expect(
      TrainingSessionSchema.safeParse(makeTrainingSession({ aggregateScore: 1 })).success,
    ).toBe(true);
  });

  it("accepts weakAreas as null", () => {
    expect(TrainingSessionSchema.safeParse(makeTrainingSession({ weakAreas: null })).success).toBe(
      true,
    );
  });

  it("accepts weakAreas as a string array", () => {
    expect(
      TrainingSessionSchema.safeParse(
        makeTrainingSession({ weakAreas: ["Phishing", "Password hygiene"] }),
      ).success,
    ).toBe(true);
  });

  it("rejects version of 0", () => {
    expect(TrainingSessionSchema.safeParse(makeTrainingSession({ version: 0 })).success).toBe(
      false,
    );
  });

  it("rejects non-datetime createdAt", () => {
    expect(TrainingSessionSchema.safeParse(makeTrainingSession({ createdAt: "bad" })).success).toBe(
      false,
    );
  });

  it("rejects non-datetime completedAt (non-null invalid string)", () => {
    expect(
      TrainingSessionSchema.safeParse(makeTrainingSession({ completedAt: "not-a-date" })).success,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FreeTextEvaluationSchema
// ---------------------------------------------------------------------------

describe("FreeTextEvaluationSchema", () => {
  it("accepts a valid evaluation", () => {
    const result = FreeTextEvaluationSchema.safeParse({ score: 0.85, rationale: "Good work." });
    expect(result.success).toBe(true);
  });

  it("accepts score of 0", () => {
    expect(FreeTextEvaluationSchema.safeParse({ score: 0, rationale: "Not good." }).success).toBe(
      true,
    );
  });

  it("accepts score of 1", () => {
    expect(FreeTextEvaluationSchema.safeParse({ score: 1, rationale: "Perfect." }).success).toBe(
      true,
    );
  });

  it("rejects score below 0", () => {
    expect(
      FreeTextEvaluationSchema.safeParse({ score: -0.1, rationale: "Negative." }).success,
    ).toBe(false);
  });

  it("rejects score above 1", () => {
    expect(FreeTextEvaluationSchema.safeParse({ score: 1.1, rationale: "Too high." }).success).toBe(
      false,
    );
  });

  it("rejects empty rationale (min 1)", () => {
    expect(FreeTextEvaluationSchema.safeParse({ score: 0.5, rationale: "" }).success).toBe(false);
  });

  it("rejects missing rationale", () => {
    expect(FreeTextEvaluationSchema.safeParse({ score: 0.5 }).success).toBe(false);
  });

  it("rejects missing score", () => {
    expect(FreeTextEvaluationSchema.safeParse({ rationale: "Some text." }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ScenarioSubmissionSchema (API T003)
// ---------------------------------------------------------------------------

describe("ScenarioSubmissionSchema", () => {
  const validMc = {
    scenarioId: "sc-1",
    responseType: "multiple-choice" as const,
    selectedOption: "A",
  };

  const validFt = {
    scenarioId: "sc-1",
    responseType: "free-text" as const,
    freeTextResponse: "My answer.",
  };

  it("accepts a valid multiple-choice submission", () => {
    expect(ScenarioSubmissionSchema.safeParse(validMc).success).toBe(true);
  });

  it("accepts a valid free-text submission", () => {
    expect(ScenarioSubmissionSchema.safeParse(validFt).success).toBe(true);
  });

  it("rejects empty scenarioId (min 1)", () => {
    expect(ScenarioSubmissionSchema.safeParse({ ...validMc, scenarioId: "" }).success).toBe(false);
  });

  it("rejects missing scenarioId", () => {
    const { scenarioId: _, ...rest } = validMc;
    expect(ScenarioSubmissionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing responseType", () => {
    const { responseType: _, ...rest } = validMc;
    expect(ScenarioSubmissionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid responseType", () => {
    expect(ScenarioSubmissionSchema.safeParse({ ...validMc, responseType: "essay" }).success).toBe(
      false,
    );
  });

  it("rejects freeTextResponse exceeding 2000 chars", () => {
    expect(
      ScenarioSubmissionSchema.safeParse({
        ...validFt,
        freeTextResponse: "x".repeat(2001),
      }).success,
    ).toBe(false);
  });

  it("accepts freeTextResponse at exactly 2000 chars", () => {
    expect(
      ScenarioSubmissionSchema.safeParse({
        ...validFt,
        freeTextResponse: "x".repeat(2000),
      }).success,
    ).toBe(true);
  });

  it("treats selectedOption as optional", () => {
    const { selectedOption: _, ...rest } = validMc;
    expect(ScenarioSubmissionSchema.safeParse(rest).success).toBe(true);
  });

  it("treats freeTextResponse as optional", () => {
    const { freeTextResponse: _, ...rest } = validFt;
    expect(ScenarioSubmissionSchema.safeParse(rest).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// QuizSubmissionSchema (API T003)
// ---------------------------------------------------------------------------

describe("QuizSubmissionSchema", () => {
  const validAnswer = {
    questionId: "q-1",
    responseType: "multiple-choice" as const,
    selectedOption: "B",
  };

  const validSubmission = { answers: [validAnswer] };

  it("accepts a valid quiz submission", () => {
    expect(QuizSubmissionSchema.safeParse(validSubmission).success).toBe(true);
  });

  it("accepts multiple answers", () => {
    const result = QuizSubmissionSchema.safeParse({
      answers: [
        validAnswer,
        { questionId: "q-2", responseType: "free-text", freeTextResponse: "Some text." },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty answers array (min 1)", () => {
    expect(QuizSubmissionSchema.safeParse({ answers: [] }).success).toBe(false);
  });

  it("rejects missing answers field", () => {
    expect(QuizSubmissionSchema.safeParse({}).success).toBe(false);
  });

  it("rejects answer with empty questionId (min 1)", () => {
    expect(
      QuizSubmissionSchema.safeParse({
        answers: [{ ...validAnswer, questionId: "" }],
      }).success,
    ).toBe(false);
  });

  it("rejects answer with missing questionId", () => {
    const { questionId: _, ...rest } = validAnswer;
    expect(QuizSubmissionSchema.safeParse({ answers: [rest] }).success).toBe(false);
  });

  it("rejects answer with missing responseType", () => {
    const { responseType: _, ...rest } = validAnswer;
    expect(QuizSubmissionSchema.safeParse({ answers: [rest] }).success).toBe(false);
  });

  it("rejects freeTextResponse exceeding 2000 chars", () => {
    expect(
      QuizSubmissionSchema.safeParse({
        answers: [
          {
            questionId: "q-1",
            responseType: "free-text",
            freeTextResponse: "x".repeat(2001),
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts freeTextResponse at exactly 2000 chars", () => {
    expect(
      QuizSubmissionSchema.safeParse({
        answers: [
          {
            questionId: "q-1",
            responseType: "free-text",
            freeTextResponse: "x".repeat(2000),
          },
        ],
      }).success,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// McOptionClientSchema (API T003 – client-safe)
// ---------------------------------------------------------------------------

describe("McOptionClientSchema", () => {
  it("accepts a valid client option without correct field", () => {
    expect(McOptionClientSchema.safeParse({ key: "A", text: "Option A" }).success).toBe(true);
  });

  it("rejects missing key", () => {
    expect(McOptionClientSchema.safeParse({ text: "Option A" }).success).toBe(false);
  });

  it("rejects missing text", () => {
    expect(McOptionClientSchema.safeParse({ key: "A" }).success).toBe(false);
  });

  it("does not expose correct field (strips unknown keys)", () => {
    const result = McOptionClientSchema.safeParse({ key: "A", text: "Option A", correct: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("correct" in result.data).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// ScenarioClientSchema (API T003 – client-safe)
// ---------------------------------------------------------------------------

describe("ScenarioClientSchema", () => {
  const validClientScenario = {
    id: "sc-1",
    narrative: "A narrative.",
    responseType: "multiple-choice" as const,
    options: [{ key: "A", text: "Option A" }],
  };

  it("accepts a valid client scenario", () => {
    expect(ScenarioClientSchema.safeParse(validClientScenario).success).toBe(true);
  });

  it("accepts a scenario with no options (free-text)", () => {
    const result = ScenarioClientSchema.safeParse({
      id: "sc-1",
      narrative: "A narrative.",
      responseType: "free-text",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing id", () => {
    const { id: _, ...rest } = validClientScenario;
    expect(ScenarioClientSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing narrative", () => {
    const { narrative: _, ...rest } = validClientScenario;
    expect(ScenarioClientSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing responseType", () => {
    const { responseType: _, ...rest } = validClientScenario;
    expect(ScenarioClientSchema.safeParse(rest).success).toBe(false);
  });

  it("does not include correct in nested options", () => {
    const result = ScenarioClientSchema.safeParse({
      ...validClientScenario,
      options: [{ key: "A", text: "Option A", correct: true }],
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.options) {
      const firstOption = result.data.options.at(0);
      expect(firstOption !== undefined && !("correct" in firstOption)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// QuizQuestionClientSchema (API T003 – client-safe)
// ---------------------------------------------------------------------------

describe("QuizQuestionClientSchema", () => {
  const validClientQuestion = {
    id: "q-1",
    text: "A question?",
    responseType: "multiple-choice" as const,
    options: [{ key: "A", text: "Option A" }],
  };

  it("accepts a valid client question", () => {
    expect(QuizQuestionClientSchema.safeParse(validClientQuestion).success).toBe(true);
  });

  it("accepts a question with no options", () => {
    const result = QuizQuestionClientSchema.safeParse({
      id: "q-1",
      text: "A question?",
      responseType: "free-text",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing text", () => {
    const { text: _, ...rest } = validClientQuestion;
    expect(QuizQuestionClientSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing id", () => {
    const { id: _, ...rest } = validClientQuestion;
    expect(QuizQuestionClientSchema.safeParse(rest).success).toBe(false);
  });

  it("does not include rubric (server-only field stripped)", () => {
    const result = QuizQuestionClientSchema.safeParse({
      ...validClientQuestion,
      rubric: "Grade strictly.",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("rubric" in result.data).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// ModuleContentClientSchema (API T003 – client-safe)
// ---------------------------------------------------------------------------

describe("ModuleContentClientSchema", () => {
  const validClientContent = {
    instruction: "Study this.",
    scenarios: [
      {
        id: "sc-1",
        narrative: "A narrative.",
        responseType: "multiple-choice" as const,
        options: [{ key: "A", text: "Option A" }],
      },
    ],
    quiz: {
      questions: [
        {
          id: "q-1",
          text: "A question?",
          responseType: "multiple-choice" as const,
          options: [{ key: "A", text: "Option A" }],
        },
      ],
    },
    generatedAt: ISO,
  };

  it("accepts valid client module content", () => {
    expect(ModuleContentClientSchema.safeParse(validClientContent).success).toBe(true);
  });

  it("rejects empty instruction", () => {
    expect(
      ModuleContentClientSchema.safeParse({ ...validClientContent, instruction: "" }).success,
    ).toBe(false);
  });

  it("rejects empty scenarios array", () => {
    expect(
      ModuleContentClientSchema.safeParse({ ...validClientContent, scenarios: [] }).success,
    ).toBe(false);
  });

  it("rejects empty quiz questions array", () => {
    expect(
      ModuleContentClientSchema.safeParse({
        ...validClientContent,
        quiz: { questions: [] },
      }).success,
    ).toBe(false);
  });

  it("rejects non-datetime generatedAt", () => {
    expect(
      ModuleContentClientSchema.safeParse({
        ...validClientContent,
        generatedAt: "bad-date",
      }).success,
    ).toBe(false);
  });

  it("does not include correct in scenario options", () => {
    const input = {
      ...validClientContent,
      scenarios: [
        {
          id: "sc-1",
          narrative: "A narrative.",
          responseType: "multiple-choice" as const,
          options: [{ key: "A", text: "Option A", correct: true }],
        },
      ],
    };
    const result = ModuleContentClientSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const firstScenario = result.data.scenarios.at(0);
      const firstOption = firstScenario?.options?.at(0);
      expect(firstOption !== undefined && !("correct" in firstOption)).toBe(true);
    }
  });

  it("does not include rubric in scenarios", () => {
    const input = {
      ...validClientContent,
      scenarios: [
        {
          id: "sc-1",
          narrative: "A narrative.",
          responseType: "free-text" as const,
          rubric: "Grade by X.",
        },
      ],
    };
    const result = ModuleContentClientSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const firstScenario = result.data.scenarios.at(0);
      expect(firstScenario !== undefined && !("rubric" in firstScenario)).toBe(true);
    }
  });

  it("does not include rubric in quiz questions", () => {
    const input = {
      ...validClientContent,
      quiz: {
        questions: [
          {
            id: "q-1",
            text: "A question?",
            responseType: "free-text" as const,
            rubric: "Grade strictly.",
          },
        ],
      },
    };
    const result = ModuleContentClientSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const firstQuestion = result.data.quiz.questions.at(0);
      expect(firstQuestion !== undefined && !("rubric" in firstQuestion)).toBe(true);
    }
  });
});
