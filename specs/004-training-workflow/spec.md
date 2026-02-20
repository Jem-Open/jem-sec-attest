# Feature Specification: Guided Training Workflow

**Feature Branch**: `004-training-workflow`
**Created**: 2026-02-19
**Status**: Draft
**Input**: User description: "Implement a guided, hybrid training workflow that teaches and assesses employees. Training must be generated based on the derived role profile and tenant policy configuration by the LLM inside AI SDK. The workflow must include modules, scenarios, quizzes, that are generated on the fly by the LLM and a final pass/fail decision evaluated by the LLM. Acceptance criteria: Employee can complete onboarding training end-to-end; result is pass or fail; failures trigger remediation and re-assessment by the LLM; workflow state is resilient to refresh/retry."

## Clarifications

### Session 2026-02-20

- Q: How is the pass/fail decision determined — holistic LLM judgment, numeric threshold, per-module gate, or hybrid? → A: Numeric threshold (>= 70% aggregate score). Multiple-choice questions are scored numerically without LLM involvement; only free-text written responses require LLM qualitative judgment. The LLM generates both question types.
- Q: How is the number of modules per curriculum determined? → A: LLM-determined based on the employee's job expectations, capped at a maximum of 8 modules.
- Q: What is the interaction format for scenarios? → A: Mixed — LLM generates scenarios with either multiple-choice or free-text responses as appropriate. Same dual evaluation model as quizzes (multiple-choice scored numerically, free-text scored by LLM).
- Q: How does session abandonment work? → A: Explicit action — employee clicks "Abandon Training" with a confirmation dialog. Abandonment counts toward the 3-attempt limit.
- Q: Is the curriculum outline generated upfront or module-by-module? → A: Outline upfront, content on-demand. LLM generates the full module list (titles, topics, order) at session start; detailed content (instructional material, scenarios, quizzes) is generated when the employee enters each module.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Complete Onboarding Training End-to-End (Priority: P1)

An authenticated employee with a confirmed role profile navigates to the training page for their tenant. The system generates a personalized training curriculum based on the employee's role profile (job expectations) and the tenant's policy configuration. The employee progresses through a series of training modules — each containing instructional content, real-world scenarios, and a quiz. After completing all modules, the system evaluates the employee's overall performance and issues a pass or fail decision. The employee sees their final result and, if they passed, is marked as training-complete.

**Why this priority**: This is the core value proposition — without end-to-end training completion, the feature delivers no value. Every other story builds on this foundation.

**Independent Test**: Can be fully tested by logging in as an employee with a confirmed role profile, navigating to the training page, completing all generated modules, and verifying a pass/fail result is recorded.

**Acceptance Scenarios**:

1. **Given** an authenticated employee with a confirmed role profile, **When** the employee navigates to the training page, **Then** the system generates a personalized training curriculum with at least one module tailored to their job expectations.
2. **Given** an employee viewing their training curriculum, **When** the employee opens a module, **Then** the module displays instructional content relevant to one or more of their job expectations.
3. **Given** an employee who has read a module's instructional content, **When** they proceed to the scenario section, **Then** a realistic workplace scenario is presented that tests comprehension of the module's material.
4. **Given** an employee who has completed a module's scenario, **When** they proceed to the quiz, **Then** the quiz contains questions that assess understanding of the module's content and the scenario's lessons.
5. **Given** an employee who has completed all modules, **When** the system evaluates their cumulative results, **Then** a final pass or fail decision is rendered and displayed to the employee.
6. **Given** an employee who has received a pass result, **When** they view their training status, **Then** their training is recorded as complete with a timestamp.

---

### User Story 2 - Remediation After Failure (Priority: P2)

An employee who fails the overall training assessment is not locked out. Instead, the system identifies which areas the employee struggled with (based on quiz and scenario performance), generates targeted remediation content focusing on those weak areas, and then re-assesses the employee. This cycle repeats until the employee passes or reaches a maximum attempt limit.

**Why this priority**: Remediation is essential for the training to be meaningful — a pass/fail without a path to improvement would block employees permanently and defeat the purpose of onboarding training.

**Independent Test**: Can be tested by deliberately failing quiz questions, verifying that remediation modules are generated for weak areas, and confirming re-assessment produces a new pass/fail decision.

**Acceptance Scenarios**:

1. **Given** an employee who has received a fail result, **When** they view their training status, **Then** the system shows which topic areas need improvement and offers a remediation path.
2. **Given** an employee on a remediation path, **When** they begin remediation, **Then** the system generates focused training content targeting only the areas where the employee performed poorly.
3. **Given** an employee who has completed remediation modules, **When** the system re-assesses them, **Then** a new pass/fail decision is rendered based on both original passing areas and newly remediated areas.
4. **Given** an employee who has reached the maximum number of training attempts, **When** they fail again, **Then** the system records the final failure and informs the employee that further remediation requires administrative action.

---

### User Story 3 - Resume Training After Interruption (Priority: P3)

An employee who is partway through training — whether in a module, between modules, or in remediation — can close their browser, refresh the page, or return hours later and pick up exactly where they left off. No progress is lost.

**Why this priority**: Resilience to interruption is a stated acceptance criterion and essential for real-world usage where employees may be interrupted, lose connectivity, or need to complete training across multiple sessions.

**Independent Test**: Can be tested by progressing partway through a module, refreshing the browser, and verifying the training resumes at the exact same point with all prior answers and progress preserved.

**Acceptance Scenarios**:

1. **Given** an employee who is partway through a training module, **When** they refresh the browser, **Then** the training page loads with their current module and progress intact.
2. **Given** an employee who has completed 2 of 4 modules, **When** they close the browser and return later, **Then** the training page shows modules 1 and 2 as complete and module 3 ready to begin.
3. **Given** an employee in the middle of a quiz, **When** they refresh the page, **Then** previously submitted answers are preserved and the quiz resumes from the next unanswered question.
4. **Given** an employee on a remediation path, **When** they return after an interruption, **Then** the remediation state is preserved including which areas were identified as weak and any remediation modules already completed.

---

### User Story 4 - View Training Progress and History (Priority: P4)

An employee can view a summary of their training journey at any time — which modules they have completed, their quiz scores, their current status (in-progress, passed, failed, in-remediation), and the history of their attempts.

**Why this priority**: Visibility into progress motivates completion and gives employees confidence about where they stand. It also supports auditability.

**Independent Test**: Can be tested by partially completing training and verifying the progress view accurately reflects completed modules, scores, and current status.

**Acceptance Scenarios**:

1. **Given** an employee with an in-progress training session, **When** they view their training dashboard, **Then** they see a list of all modules with completion status for each.
2. **Given** an employee who has completed training (pass or fail), **When** they view their training history, **Then** they see the date of completion, the overall result, and per-module scores.
3. **Given** an employee who has undergone remediation, **When** they view their training history, **Then** all attempts are visible including the original assessment and each remediation cycle.

---

### Edge Cases

- What happens when an employee navigates to training but has no confirmed role profile? The system redirects them to the intake flow.
- What happens if the LLM fails to generate training content mid-workflow (e.g., timeout, rate limit)? The system preserves all existing progress and allows the employee to retry content generation from the point of failure.
- What happens if an employee's role profile is updated while training is in progress? The in-progress training session continues with the original curriculum; a new training session based on the updated profile can be initiated after the current one completes or is explicitly abandoned.
- What happens if the tenant's AI configuration changes mid-training? The system uses the AI configuration that was active when the training session was initiated for consistency. New sessions use the updated configuration.
- What happens if two browser tabs attempt to advance the same training session simultaneously? The system uses optimistic concurrency — the first write wins, and the second tab receives a conflict notification prompting a refresh.
- What happens if quiz answers are submitted but the pass/fail evaluation fails? Quiz answers remain persisted; the evaluation can be retried without re-answering questions.
- What happens when an employee abandons a training session? The abandonment counts as one of the 3 allowed attempts. A confirmation dialog warns the employee before finalizing. The abandoned session is recorded with its partial progress for audit purposes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate a personalized training curriculum outline (module titles, topic areas, order, and job expectation mappings) at session start based on the employee's confirmed role profile and tenant policy configuration. This outline is generated upfront via a single LLM call and becomes the immutable structure for the session.
- **FR-002**: Each training curriculum MUST consist of one or more modules (count determined by the LLM based on role profile complexity, capped at a maximum of 8), where each module contains: instructional content, at least one scenario, and a quiz.
- **FR-003**: Detailed module content (instructional material, scenarios, quizzes) MUST be generated dynamically by the LLM at the time the employee begins each module, not pre-generated in bulk. Only the curriculum outline (FR-001) is generated upfront.
- **FR-004**: System MUST persist the training session state after each meaningful interaction (module completion, quiz submission, scenario response) so that progress survives browser refresh, tab closure, and session expiry.
- **FR-005**: System MUST compute an aggregate score across all modules upon completion and render a pass decision if the score is >= 70%, or a fail decision otherwise. Multiple-choice questions are scored numerically without LLM involvement; free-text responses are scored by the LLM with a numeric value.
- **FR-006**: When an employee fails, the system MUST identify weak areas based on quiz and scenario performance and generate targeted remediation modules covering only those areas.
- **FR-007**: After completing remediation, the system MUST re-assess the employee via the LLM and render a new pass or fail decision.
- **FR-008**: System MUST enforce a maximum of 3 total training attempts (1 initial + 2 remediation cycles) per training session; further remediation requires administrative intervention.
- **FR-009**: System MUST prevent an employee from starting a new training session while one is in progress; the in-progress session must be completed or explicitly abandoned first. Abandonment requires an explicit employee action ("Abandon Training") with a confirmation dialog, and counts toward the 3-attempt limit.
- **FR-010**: System MUST record an audit event for each significant training action: session started, module completed, quiz submitted, pass/fail decision rendered, remediation initiated, session abandoned.
- **FR-011**: System MUST display the employee's current training status and progress at all times during the workflow.
- **FR-012**: System MUST validate that an employee has a confirmed role profile before allowing them to begin training; employees without a profile are redirected to intake.
- **FR-013**: Quizzes MUST include both multiple-choice and free-text question types. Multiple-choice questions are evaluated numerically (correct/incorrect) without LLM involvement. Free-text responses are evaluated qualitatively by the LLM, which assigns a numeric score. Both question types contribute to the aggregate module score.
- **FR-014**: System MUST preserve the curriculum structure (module titles, order, topic mapping) for the duration of a training session, even if the underlying AI model or configuration changes.
- **FR-015**: System MUST associate each training session with the config hash and role profile version that were active at session creation for auditability.

### Key Entities

- **Training Session**: Represents a single end-to-end training attempt for an employee within a tenant. Attributes: employee identity, tenant identity, role profile version, config hash, overall status (in-progress, passed, failed, abandoned), attempt number, timestamps. One active session per employee per tenant at a time.
- **Training Curriculum**: The generated structure for a training session — an ordered list of modules (1–8, determined by LLM based on role profile complexity) with their topic mappings to job expectations. Created once per session (or remediation cycle) and immutable thereafter.
- **Training Module**: A single unit of instruction within a curriculum. Contains instructional content, one or more scenarios, and a quiz. Attributes: module title, topic area, completion status, associated job expectations.
- **Scenario**: A realistic workplace situation within a module that the employee must analyze or respond to. Response format is mixed: LLM generates scenarios with either multiple-choice options (scored numerically) or free-text prompts (scored qualitatively by LLM) as appropriate to the situation. Attributes: scenario narrative, response type (multiple-choice or free-text), employee's response, numeric score. Scenario scores contribute to the module's aggregate score.
- **Quiz**: An assessment within a module consisting of one or more questions of two types: multiple-choice (scored numerically, no LLM needed) and free-text (scored qualitatively by LLM with numeric value). Attributes: questions (with type indicator), employee's answers, per-question score, overall module score.
- **Training Result**: The final outcome of a training session or remediation cycle. Attributes: pass/fail decision, aggregate score (percentage), per-module scores, weak areas identified (if failed), timestamp.
- **Remediation Plan**: Generated after a failure, identifying which topic areas need re-training. Links the original session's weak areas to a new targeted curriculum.

## Assumptions

- The employee is already authenticated via SSO (feature 002) and has a confirmed role profile from the intake flow (feature 003) before accessing training.
- The tenant's policy configuration includes sufficient context (via existing `settings` fields such as `features`, `branding`, and any additional policy-relevant fields) for the LLM to generate domain-appropriate training content.
- LLM calls are routed through Vercel AI Gateway by default, consistent with the existing `ai-model-resolver` pattern.
- The existing `StorageAdapter` and its transaction support are sufficient for persisting training workflow state.
- Training content does not need to be cached or reused across employees — each employee receives freshly generated content tailored to their specific role profile.
- The maximum of 3 attempts (1 initial + 2 remediation) is a reasonable default; this can be made configurable per tenant in future iterations.
- Module content is generated one module at a time (on-demand) rather than all at once, to reduce latency at training start and allow the curriculum to remain responsive.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An employee can complete the full training workflow (all modules, scenarios, quizzes, and final evaluation) in a single session without encountering dead ends or unrecoverable errors.
- **SC-002**: 100% of training sessions result in a recorded pass or fail decision (no sessions left in an indeterminate state after the employee completes all modules).
- **SC-003**: An employee who refreshes the browser or returns after closing it resumes training at the exact point of interruption with zero loss of progress.
- **SC-004**: An employee who fails receives at least one remediation cycle with content targeted to their specific weak areas, and the re-assessment produces a new pass/fail decision.
- **SC-005**: Every significant training action (session start, module completion, quiz submission, evaluation, remediation) is recorded as an audit event retrievable by tenant.
- **SC-006**: An employee without a confirmed role profile is prevented from starting training and is directed to complete the intake process first.
- **SC-007**: Training content generated by the LLM is relevant to the employee's specific job expectations as defined in their role profile — quiz questions and scenarios directly relate to the employee's listed responsibilities.
- **SC-008**: The training workflow supports at least 50 concurrent employees across multiple tenants without degradation in content generation or state persistence.
