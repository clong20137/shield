import { PerformanceEvaluation } from '../services/api';

function escapePdfText(value: unknown) {
  return String(value ?? '')
    .replace(/\\/gu, '\\\\')
    .replace(/\(/gu, '\\(')
    .replace(/\)/gu, '\\)')
    .replace(/\r?\n/gu, ' ');
}

function wrapPdfText(label: string, value: unknown, maxLength = 86) {
  const text = `${label}: ${String(value || 'Not recorded')}`;
  const words = text.split(/\s+/u);
  const lines: string[] = [];
  let line = '';

  words.forEach((word) => {
    const nextLine = line ? `${line} ${word}` : word;
    if (nextLine.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = nextLine;
    }
  });

  if (line) {
    lines.push(line);
  }

  return lines;
}

function getEvaluationLines(evaluation: PerformanceEvaluation, index?: number) {
  return [
    index === undefined ? 'Performance Evaluation' : `Performance Evaluation ${index + 1}`,
    ...wrapPdfText('Employee', evaluation.employeeName),
    ...wrapPdfText('Employee Email', evaluation.employeeEmail),
    ...wrapPdfText('Supervisor', evaluation.supervisorName),
    ...wrapPdfText('Period', evaluation.evaluationPeriod),
    ...wrapPdfText('Position', evaluation.positionTitle),
    ...wrapPdfText('District', evaluation.district),
    ...wrapPdfText('Status', evaluation.status),
    ...wrapPdfText('Sent', evaluation.sentAt ? new Date(evaluation.sentAt).toLocaleString() : ''),
    ...wrapPdfText('Supervisor Signed', evaluation.supervisorSignedAt ? new Date(evaluation.supervisorSignedAt).toLocaleString() : ''),
    ...wrapPdfText('Employee Signed', evaluation.employeeSignedAt ? new Date(evaluation.employeeSignedAt).toLocaleString() : ''),
    ...wrapPdfText('Supervisor Signature', evaluation.supervisorSignature),
    ...wrapPdfText('Employee Signature', evaluation.employeeSignature),
    ...wrapPdfText('Strengths', evaluation.strengths),
    ...wrapPdfText('Improvements', evaluation.improvements),
    ...wrapPdfText('Goals', evaluation.goals),
    ...wrapPdfText('Supervisor Comments', evaluation.supervisorComments),
    ...wrapPdfText('Employee Comments', evaluation.employeeComments),
    '',
  ];
}

export function createPerformanceEvaluationPdf(evaluations: PerformanceEvaluation[]) {
  const lines = evaluations.length > 0
    ? evaluations.flatMap((evaluation, index) => getEvaluationLines(evaluation, evaluations.length > 1 ? index : undefined))
    : ['Performance Evaluations', 'No performance evaluations were found for this account.'];
  const pages: string[][] = [];
  const pageSize = 42;

  for (let index = 0; index < lines.length; index += pageSize) {
    pages.push(lines.slice(index, index + pageSize));
  }

  const objects: string[] = [];
  const addObject = (content: string) => {
    objects.push(content);
    return objects.length;
  };
  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesId = addObject('');
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageObjectIds: number[] = [];

  pages.forEach((pageLines) => {
    const stream = [
      'BT',
      '/F1 11 Tf',
      '50 760 Td',
      ...pageLines.flatMap((line, index) => [
        index === 0 ? '' : '0 -16 Td',
        `(${escapePdfText(line)}) Tj`,
      ]).filter(Boolean),
      'ET',
    ].join('\n');
    const contentId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageObjectIds.push(pageId);
  });

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return pdf;
}

export function downloadPerformanceEvaluationPdf(evaluations: PerformanceEvaluation[], filename = 'shield-performance-evaluations.pdf') {
  const blob = new Blob([createPerformanceEvaluationPdf(evaluations)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
