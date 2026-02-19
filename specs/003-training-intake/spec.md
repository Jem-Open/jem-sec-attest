# Feature Specification: Employee Training Intake

**Feature Branch**: `003-training-intake`
**Created**: 2026-02-18
**Status**: Draft
**Input**: User description: "Create the employee training intake experience. Employees must paste their job expectations/job description into a textbox as the start of training. The system must treat this input as untrusted and must not persist the raw job text by default. The system must produce a structured role profile that will drive training personalization. Scope: job expectations only — no tool/system inference."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Submit Job Expectations for Profile Generation (Priority: P1)

An authenticated employee navigates to the training intake page and is presented with a textbox prompting them to paste their job description or job expectations. The employee pastes or types their job text and submits it. The system processes the input, generates a structured role profile consisting of inferred job expectations (key responsibilities and duties), and presents the employee with a preview. The raw job text is discarded after processing and is never persisted to storage.

**Why this priority**: This is the core intake flow. Without it, no role profile can be created and training personalization cannot begin. It delivers the primary value of the feature end-to-end.

**Independent Test**: Can be fully tested by an authenticated employee pasting a sample job description, submitting it, and verifying a role profile preview appears with a list of inferred job expectations.

**Acceptance Scenarios**:

1. **Given** an authenticated employee on the training intake page, **When** they paste a valid job description (50-10,000 characters) and submit, **Then** the system displays a loading indicator, processes the text, and shows a preview of the inferred role profile within 30 seconds.
2. **Given** the system has generated a role profile preview, **When** the employee reviews it, **Then** they see a list of inferred job expectations (key responsibilities and duties relevant to their role).
3. **Given** the employee has submitted their job text, **When** the role profile is generated, **Then** the raw job description text is not written to any persistent storage (database, file system, or logs).

---

### User Story 2 - Confirm or Edit Role Profile (Priority: P2)

After reviewing the preview of their inferred role profile, the employee can confirm that the expectations are accurate or edit them. On confirmation, the structured role profile is persisted and associated with the employee's account, making it available for training personalization downstream.

**Why this priority**: Confirmation ensures the employee has agency over their profile and that incorrect inferences don't drive wrong training paths. This is essential for trust and accuracy but depends on Story 1 existing first.

**Independent Test**: Can be tested by presenting a mock role profile preview and verifying the employee can confirm it, after which it is stored and retrievable.

**Acceptance Scenarios**:

1. **Given** an employee is viewing their role profile preview, **When** they click "Confirm", **Then** the structured role profile is persisted and linked to their employee record.
2. **Given** an employee is viewing their role profile preview, **When** they find inaccuracies, **Then** they can edit the inferred job expectations before confirming.
3. **Given** the generated profile has no inferred job expectations, **When** the employee views the preview, **Then** the system shows a warning and disables confirmation until the employee manually adds at least one expectation.
4. **Given** an employee has confirmed their role profile, **When** they return to the training area, **Then** the system recognizes they have completed intake and does not prompt them again.

---

### User Story 3 - Re-do Intake with New Job Description (Priority: P3)

An employee whose role has changed, or who initially provided a poor job description, can re-initiate the intake process. They paste a new job description, and the system generates a fresh role profile that replaces the previous one upon confirmation.

**Why this priority**: Role changes happen over time. Allowing re-intake keeps training relevant, but it is not needed for initial launch and can be added incrementally.

**Independent Test**: Can be tested by an employee with an existing confirmed profile navigating to intake, submitting a new job description, confirming the new profile, and verifying the old profile is replaced.

**Acceptance Scenarios**:

1. **Given** an employee with an existing confirmed role profile, **When** they navigate to the intake page and submit a new job description, **Then** the system generates a new role profile preview without affecting the existing profile until confirmation.
2. **Given** an employee has confirmed a new role profile, **When** the update completes, **Then** the previous profile is replaced by the new one and a record of the change is kept for audit purposes.

---

### Edge Cases

- What happens when the employee submits an empty or extremely short text (fewer than 50 characters)? The system displays a validation message asking for a more detailed job description.
- What happens when the employee submits text that is not a job description (e.g., random characters, offensive content, or injection attempts)? The system treats all input as untrusted, sanitizes it for traditional injection vectors (XSS, script injection), and isolates the text from AI instructions using structured prompt boundaries. If no meaningful expectations can be inferred, the system displays a message asking the employee to provide a valid job description.
- What happens when the profile generation service is temporarily unavailable? The system displays a friendly error message and allows the employee to retry without losing their pasted text.
- What happens when the employee closes the browser or navigates away before confirming? The role profile preview is lost (not persisted), and the employee must re-submit their job description on their next visit.
- What happens when two concurrent sessions attempt intake for the same employee? Only the most recently confirmed profile takes effect; the system prevents duplicate or conflicting profiles.
- What happens when the AI generates a profile with no job expectations? The system displays the empty preview with a warning message and disables the "Confirm" button. The employee must manually add at least one expectation before confirmation is allowed.
- What happens when the job description contains personally identifiable information (PII) beyond job duties? Since the raw text is not persisted and is discarded after processing, PII exposure is minimized. The structured role profile should contain only role-related expectations, not personal details.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST present authenticated employees with a textbox to paste or type their job description/expectations on the training intake page.
- **FR-002**: System MUST validate that submitted job text is between 50 and 10,000 characters before processing.
- **FR-003**: System MUST treat all submitted job text as untrusted input and sanitize it for traditional injection vectors (XSS, script injection) before any processing.
- **FR-003a**: System MUST use structured prompt boundaries to isolate untrusted job text from AI processing instructions, preventing prompt injection attacks from manipulating role profile generation.
- **FR-004**: System MUST NOT persist the raw job description text to any storage (database, file system, or application logs) by default.
- **FR-005**: System MUST generate a structured role profile from the submitted job text, extracting up to 15 inferred job expectations (free-text descriptions of key responsibilities and duties).
- **FR-006**: System MUST display a preview of the generated role profile to the employee, showing inferred job expectations as a reviewable list.
- **FR-006a**: If the generated profile contains no job expectations, the system MUST display a warning on the preview screen and block confirmation until the employee manually adds at least one expectation.
- **FR-007**: System MUST allow the employee to confirm the role profile, which persists it and associates it with their employee record.
- **FR-008**: System MUST allow the employee to add, edit, or remove inferred job expectations on the preview screen before confirming, subject to the maximum limit of 15 expectations.
- **FR-009**: System MUST discard the raw job text from memory after the role profile has been generated (i.e., it is not held in session or cache beyond the processing request lifecycle).
- **FR-010**: System MUST display a visual loading indicator while the role profile is being generated.
- **FR-011**: System MUST display a clear error message if profile generation fails, and allow the employee to retry without re-entering their text.
- **FR-012**: System MUST prevent an employee from proceeding to training without a confirmed role profile.
- **FR-013**: System MUST allow employees with an existing confirmed profile to re-initiate intake to update their role profile.
- **FR-014**: System MUST record an audit event when a role profile is confirmed or updated, including the employee identifier and timestamp (but not the raw job text).

### Key Entities

- **Role Profile**: A structured representation of an employee's role derived from their job description. Contains up to 15 inferred job expectations (free-text descriptions of key responsibilities and duties). Linked to exactly one employee. Drives downstream training personalization.
- **Employee**: An authenticated user (from existing SSO, feature 002) who undergoes training intake. Has zero or one confirmed role profile at any time.
- **Audit Event**: A record of significant actions (profile confirmed, profile updated) for compliance and traceability. Contains employee identifier, action type, and timestamp. Does not contain raw job text.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 90% of employees complete the full intake flow (paste, preview, confirm) on their first attempt without errors or re-submissions.
- **SC-002**: Employees can complete the intake process (from pasting text to confirming profile) in under 2 minutes.
- **SC-003**: 100% of confirmed role profiles contain at least one inferred job expectation.
- **SC-004**: Raw job description text is verifiably absent from all persistent storage after profile generation (confirmed via audit/inspection).
- **SC-005**: Employees who review their role profile preview rate the inferred job expectations as "mostly accurate" or better at least 80% of the time.
- **SC-006**: System handles profile generation for at least 50 concurrent employee submissions without degradation in response time.

## Clarifications

### Session 2026-02-18

- Q: What level of input sanitization should be applied given the system uses AI to process untrusted job text? → A: Sanitize for traditional injection (XSS, script injection) AND use structured prompt boundaries to isolate untrusted text from AI instructions.
- Q: What should happen when AI generates an empty profile (no job expectations)? → A: Show the empty preview with a warning; block confirmation until the employee manually adds at least one expectation.
- Q: What is the maximum number of job expectations per role profile? → A: Maximum 15 expectations per profile.
- Q: Should the role profile include inferred tools/systems? → A: No. The role profile focuses exclusively on job expectations (responsibilities and duties). Tools are out of scope for this feature.

## Assumptions

- Employees are already authenticated via SSO (feature 002) before reaching the training intake page.
- The structured role profile format (list of job expectations) is sufficient for downstream training personalization; no additional profile fields are needed at this stage.
- Character limits of 50-10,000 for job descriptions are reasonable defaults that cover typical job descriptions while preventing abuse.
- The profile generation process uses AI/ML capabilities already available in the system to extract structured expectations from free text.
- "Not persisting raw text" means no database writes, no file writes, and no logging of the raw content; transient in-memory processing during the request is acceptable.
- An employee can have only one active role profile at a time; updating replaces the previous one.
- Tool/system inference is explicitly out of scope — the role profile contains only job expectations.
