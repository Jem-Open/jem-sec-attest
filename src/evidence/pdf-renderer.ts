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
 * PDF renderer for training evidence records.
 * Generates audit-ready PDF documents from immutable TrainingEvidence data.
 */

import PDFDocument from "pdfkit";
import type { TrainingEvidence } from "./schemas.js";

const PAGE_MARGIN = 50;
const FONT_SIZE_TITLE = 18;
const FONT_SIZE_SECTION = 14;
const FONT_SIZE_BODY = 10;
const FONT_SIZE_SMALL = 8;
const LINE_GAP = 4;

/**
 * Render a TrainingEvidence record as a PDF document buffer.
 */
export async function renderEvidencePdf(
  evidence: TrainingEvidence,
  tenantDisplayName: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
      info: {
        Title: "Training Evidence Certificate",
        Author: tenantDisplayName,
        Subject: `Evidence for session ${evidence.sessionId}`,
      },
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    renderHeader(doc, evidence, tenantDisplayName);
    renderEmployeeSessionInfo(doc, evidence);
    renderOutcomeSummary(doc, evidence);
    renderModuleSummaryTable(doc, evidence);
    renderQuizDetails(doc, evidence);
    renderPolicyAttestation(doc, evidence);
    renderIntegrityFooter(doc, evidence);

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Section 1: Header
// ---------------------------------------------------------------------------

function renderHeader(
  doc: PDFKit.PDFDocument,
  _evidence: TrainingEvidence,
  tenantDisplayName: string,
): void {
  doc
    .fontSize(FONT_SIZE_TITLE)
    .font("Helvetica-Bold")
    .text("Training Evidence Certificate", { align: "center" });

  doc.fontSize(FONT_SIZE_BODY).font("Helvetica").text(tenantDisplayName, { align: "center" });

  doc
    .fontSize(FONT_SIZE_SMALL)
    .fillColor("#666666")
    .text(`Generated: ${new Date().toISOString()}`, { align: "center" })
    .fillColor("#000000");

  doc.moveDown(1.5);
  drawHorizontalRule(doc);
}

// ---------------------------------------------------------------------------
// Section 2: Employee & Session Info
// ---------------------------------------------------------------------------

function renderEmployeeSessionInfo(doc: PDFKit.PDFDocument, evidence: TrainingEvidence): void {
  const { session } = evidence.evidence;
  const trainingType = evidence.evidence.trainingType ?? "Not specified";

  sectionHeading(doc, "Employee & Session Information");

  const rows: Array<[string, string]> = [
    ["Employee ID", evidence.employeeId],
    ["Tenant", evidence.tenantId],
    ["Training Type", capitalizeFirst(trainingType)],
    ["Session ID", session.sessionId],
    ["Attempt", `${session.attemptNumber} of ${session.totalAttempts}`],
    ["Started", formatDate(session.createdAt)],
    ["Completed", session.completedAt ? formatDate(session.completedAt) : "N/A"],
  ];

  for (const [label, value] of rows) {
    labelValue(doc, label, value);
  }

  doc.moveDown(0.5);
  drawHorizontalRule(doc);
}

// ---------------------------------------------------------------------------
// Section 3: Outcome Summary
// ---------------------------------------------------------------------------

function renderOutcomeSummary(doc: PDFKit.PDFDocument, evidence: TrainingEvidence): void {
  const { outcome, session } = evidence.evidence;

  sectionHeading(doc, "Outcome Summary");

  const statusLabel =
    session.status === "passed"
      ? "PASSED"
      : session.status === "exhausted"
        ? "FAILED"
        : "ABANDONED";

  labelValue(doc, "Result", statusLabel);
  labelValue(
    doc,
    "Aggregate Score",
    outcome.aggregateScore !== null ? `${(outcome.aggregateScore * 100).toFixed(1)}%` : "N/A",
  );
  labelValue(doc, "Pass Threshold", `${(outcome.passThreshold * 100).toFixed(1)}%`);

  if (outcome.weakAreas && outcome.weakAreas.length > 0) {
    labelValue(doc, "Weak Areas", outcome.weakAreas.join(", "));
  }

  doc.moveDown(0.5);
  drawHorizontalRule(doc);
}

// ---------------------------------------------------------------------------
// Section 4: Module Summary Table
// ---------------------------------------------------------------------------

function renderModuleSummaryTable(doc: PDFKit.PDFDocument, evidence: TrainingEvidence): void {
  const { modules } = evidence.evidence;

  if (modules.length === 0) {
    return;
  }

  sectionHeading(doc, "Module Summary");

  const colWidths = [40, 200, 120, 80];
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const startX = doc.x;

  // Header row
  doc.font("Helvetica-Bold").fontSize(FONT_SIZE_SMALL);
  let x = startX;
  const headers: string[] = ["#", "Title", "Topic Area", "Score"];
  for (let i = 0; i < headers.length; i++) {
    const w = colWidths[i] ?? 0;
    doc.text(headers[i] ?? "", x, doc.y, { width: w, continued: false });
    x += w;
  }
  doc.moveDown(0.3);

  // Thin line under header
  const lineY = doc.y;
  doc
    .moveTo(startX, lineY)
    .lineTo(startX + tableWidth, lineY)
    .lineWidth(0.5)
    .stroke();
  doc.moveDown(0.3);

  // Data rows
  doc.font("Helvetica").fontSize(FONT_SIZE_SMALL);
  for (const mod of modules) {
    checkPageBreak(doc, 20);
    x = startX;
    const rowY = doc.y;
    const scoreStr = mod.moduleScore !== null ? `${(mod.moduleScore * 100).toFixed(1)}%` : "N/A";
    const cells: string[] = [String(mod.moduleIndex + 1), mod.title, mod.topicArea, scoreStr];
    for (let i = 0; i < cells.length; i++) {
      const w = colWidths[i] ?? 0;
      doc.text(cells[i] ?? "", x, rowY, { width: w });
      x += w;
    }
    doc.moveDown(0.2);
  }

  doc.moveDown(0.5);
  drawHorizontalRule(doc);
}

// ---------------------------------------------------------------------------
// Section 5: Quiz Detail Per Module
// ---------------------------------------------------------------------------

function renderQuizDetails(doc: PDFKit.PDFDocument, evidence: TrainingEvidence): void {
  const { modules } = evidence.evidence;
  const hasQuizzes = modules.some((m) => m.quizQuestions.length > 0);

  if (!hasQuizzes) {
    return;
  }

  sectionHeading(doc, "Quiz Details");

  for (const mod of modules) {
    if (mod.quizQuestions.length === 0) {
      continue;
    }

    checkPageBreak(doc, 40);
    doc
      .font("Helvetica-Bold")
      .fontSize(FONT_SIZE_BODY)
      .text(`Module ${mod.moduleIndex + 1}: ${mod.title}`);
    doc.moveDown(0.3);

    for (const q of mod.quizQuestions) {
      checkPageBreak(doc, 50);
      doc.font("Helvetica-Bold").fontSize(FONT_SIZE_SMALL).text(q.questionText);

      doc.font("Helvetica").fontSize(FONT_SIZE_SMALL);

      const { selectedOption, freeTextResponse } = q.employeeAnswer;
      if (q.responseType === "multiple-choice" && selectedOption) {
        doc.text(`Answer: ${selectedOption}`);
      } else if (q.responseType === "free-text" && freeTextResponse) {
        doc.text(`Response: ${freeTextResponse}`);
      }

      doc.text(`Score: ${(q.employeeAnswer.score * 100).toFixed(1)}%`);

      const { llmRationale } = q.employeeAnswer;
      if (llmRationale) {
        doc.fillColor("#666666").text(`Rationale: ${llmRationale}`).fillColor("#000000");
      }

      doc.moveDown(0.5);
    }
  }

  drawHorizontalRule(doc);
}

// ---------------------------------------------------------------------------
// Section 6: Policy Attestation
// ---------------------------------------------------------------------------

function renderPolicyAttestation(doc: PDFKit.PDFDocument, evidence: TrainingEvidence): void {
  const { policyAttestation } = evidence.evidence;

  sectionHeading(doc, "Policy Attestation");

  const rows: Array<[string, string]> = [
    ["Config Hash", policyAttestation.configHash],
    ["Role Profile ID", policyAttestation.roleProfileId],
    ["Role Profile Version", String(policyAttestation.roleProfileVersion)],
    ["Application Version", policyAttestation.appVersion],
    ["Pass Threshold", `${(policyAttestation.passThreshold * 100).toFixed(1)}%`],
    ["Max Attempts", String(policyAttestation.maxAttempts)],
  ];

  for (const [label, value] of rows) {
    labelValue(doc, label, value);
  }

  doc.moveDown(0.5);
  drawHorizontalRule(doc);
}

// ---------------------------------------------------------------------------
// Section 7: Integrity Footer
// ---------------------------------------------------------------------------

function renderIntegrityFooter(doc: PDFKit.PDFDocument, evidence: TrainingEvidence): void {
  sectionHeading(doc, "Integrity Verification");

  const rows: Array<[string, string]> = [
    ["Content Hash (SHA-256)", evidence.contentHash],
    ["Schema Version", String(evidence.schemaVersion)],
    ["Evidence ID", evidence.id],
    ["Evidence Generated At", formatDate(evidence.generatedAt)],
  ];

  doc.font("Courier").fontSize(FONT_SIZE_SMALL);
  for (const [label, value] of rows) {
    doc.font("Helvetica-Bold").fontSize(FONT_SIZE_SMALL).text(`${label}: `, { continued: true });
    doc.font("Courier").fontSize(FONT_SIZE_SMALL).text(value);
  }

  doc.moveDown(1);
  doc
    .fontSize(FONT_SIZE_SMALL)
    .font("Helvetica")
    .fillColor("#999999")
    .text(
      "This document was generated from an immutable evidence record. " +
        "The content hash above can be used to verify the integrity of this evidence against the source system.",
      { align: "center" },
    )
    .fillColor("#000000");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sectionHeading(doc: PDFKit.PDFDocument, title: string): void {
  checkPageBreak(doc, 30);
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(FONT_SIZE_SECTION).text(title);
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(FONT_SIZE_BODY);
}

function labelValue(doc: PDFKit.PDFDocument, label: string, value: string): void {
  doc
    .font("Helvetica-Bold")
    .fontSize(FONT_SIZE_BODY)
    .text(`${label}: `, { continued: true, lineGap: LINE_GAP });
  doc.font("Helvetica").text(value);
}

function drawHorizontalRule(doc: PDFKit.PDFDocument): void {
  const y = doc.y;
  doc
    .moveTo(PAGE_MARGIN, y)
    .lineTo(doc.page.width - PAGE_MARGIN, y)
    .lineWidth(0.5)
    .strokeColor("#cccccc")
    .stroke()
    .strokeColor("#000000");
  doc.moveDown(0.5);
}

function checkPageBreak(doc: PDFKit.PDFDocument, requiredSpace: number): void {
  if (doc.y + requiredSpace > doc.page.height - PAGE_MARGIN) {
    doc.addPage();
  }
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, " UTC");
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
