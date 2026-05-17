import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileSignature, Plus, Save, Send, X } from 'lucide-react';
import { AuthAccount, PerformanceEvaluation, performanceEvaluationService, authService } from '../services/api';

interface PerformanceEvaluationsPageProps {
  currentUser: AuthAccount;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
}

const ratingFields = [
  ['jobKnowledge', 'Job Knowledge'],
  ['qualityOfWork', 'Quality of Work'],
  ['productivity', 'Productivity'],
  ['communication', 'Communication'],
  ['teamwork', 'Teamwork'],
  ['reliability', 'Reliability'],
  ['leadership', 'Leadership'],
  ['policyCompliance', 'Policy Compliance'],
] as const;

const ratingOptions = ['N/A', '1', '2', '3', '4', '5'];

const emptyForm = {
  employeeAccountId: '',
  evaluationPeriod: '',
  positionTitle: '',
  district: '',
  ratings: Object.fromEntries(ratingFields.map(([key]) => [key, '3'])) as Record<string, string>,
  strengths: '',
  improvements: '',
  goals: '',
  supervisorComments: '',
};

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Not signed';
}

function getStatusTone(status: PerformanceEvaluation['status']) {
  return status === 'Signed'
    ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200'
    : 'bg-accent/10 text-accent';
}

function EvaluationDetail({
  evaluation,
  currentUser,
  onSigned,
  onToast,
  getErrorMessage,
}: {
  evaluation: PerformanceEvaluation;
  currentUser: AuthAccount;
  onSigned: (evaluation: PerformanceEvaluation) => void;
  onToast: PerformanceEvaluationsPageProps['onToast'];
  getErrorMessage: PerformanceEvaluationsPageProps['getErrorMessage'];
}) {
  const [employeeComments, setEmployeeComments] = useState(evaluation.employeeComments || '');
  const [signature, setSignature] = useState(currentUser.displayName || currentUser.email);
  const [isSigning, setIsSigning] = useState(false);
  const canSign = evaluation.employeeAccountId === currentUser.id && evaluation.status === 'Sent';

  const signEvaluation = async () => {
    if (!signature.trim()) {
      onToast('error', 'Signature is required.');
      return;
    }

    setIsSigning(true);
    try {
      const response = await performanceEvaluationService.sign(evaluation.id, signature, employeeComments);
      onSigned(response.data);
      onToast('success', 'Evaluation signed and returned.');
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to sign evaluation.'));
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4 dark:border-gray-800">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Performance Evaluation</p>
          <h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{evaluation.employeeName}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {evaluation.evaluationPeriod} - {evaluation.positionTitle || 'No position listed'}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${getStatusTone(evaluation.status)}`}>
          {evaluation.status}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {ratingFields.map(([key, label]) => (
              <div key={key} className="rounded border border-gray-200 p-3 dark:border-gray-800">
                <p className="text-xs font-bold uppercase text-gray-400">{label}</p>
                <p className="mt-1 text-2xl font-bold text-primary-500 dark:text-blue-100">{evaluation.ratings[key] || 'N/A'}</p>
              </div>
            ))}
          </div>

          {[
            ['Strengths', evaluation.strengths],
            ['Areas for Improvement', evaluation.improvements],
            ['Goals / Next Steps', evaluation.goals],
            ['Supervisor Comments', evaluation.supervisorComments],
          ].map(([label, value]) => (
            <div key={label} className="rounded border border-gray-200 p-3 dark:border-gray-800">
              <p className="mb-2 text-sm font-bold text-gray-800 dark:text-gray-100">{label}</p>
              <p className="whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">{value || 'N/A'}</p>
            </div>
          ))}

          <div className="rounded border border-gray-200 p-3 dark:border-gray-800">
            <p className="mb-2 text-sm font-bold text-gray-800 dark:text-gray-100">Employee Comments</p>
            {canSign ? (
              <textarea
                value={employeeComments}
                onChange={(event) => setEmployeeComments(event.target.value)}
                className="min-h-24 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                placeholder="Optional comments before signing"
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">{evaluation.employeeComments || 'No employee comments.'}</p>
            )}
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded border border-gray-200 p-3 dark:border-gray-800">
            <p className="text-xs font-bold uppercase text-gray-400">Supervisor Signature</p>
            <p className="mt-2 font-serif text-2xl italic text-primary-500 dark:text-blue-100">{evaluation.supervisorSignature || evaluation.supervisorName}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDate(evaluation.supervisorSignedAt || evaluation.sentAt)}</p>
          </div>

          <div className="rounded border border-gray-200 p-3 dark:border-gray-800">
            <p className="text-xs font-bold uppercase text-gray-400">Employee Signature</p>
            {evaluation.employeeSignature ? (
              <>
                <p className="mt-2 font-serif text-2xl italic text-primary-500 dark:text-blue-100">{evaluation.employeeSignature}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDate(evaluation.employeeSignedAt)}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Awaiting employee signature.</p>
            )}
          </div>

          {canSign && (
            <div className="rounded border border-accent/30 bg-accent/5 p-3">
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-gray-800 dark:text-gray-100">Click-sign name</span>
                <input
                  value={signature}
                  onChange={(event) => setSignature(event.target.value)}
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                />
              </label>
              <button type="button" onClick={signEvaluation} className="btn-primary mt-3" disabled={isSigning} aria-label="Sign evaluation" title="Sign and Return">
                {isSigning ? <Save size={16} /> : <FileSignature size={16} />}
              </button>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

function PerformanceEvaluationsPage({ currentUser, onToast, getErrorMessage }: PerformanceEvaluationsPageProps) {
  const [evaluations, setEvaluations] = useState<PerformanceEvaluation[]>([]);
  const [accounts, setAccounts] = useState<AuthAccount[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const isSupervisor = currentUser.role === 'administrator' || currentUser.role === 'supervisor';

  const selectedEvaluation = evaluations.find((evaluation) => evaluation.id === selectedId) || evaluations[0] || null;

  const loadEvaluations = async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    try {
      const response = await performanceEvaluationService.getAll();
      setEvaluations(response.data);
      setSelectedId((currentId) => currentId || response.data[0]?.id || null);
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to load evaluations.'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEvaluations(true);
    const handleUpdate = () => loadEvaluations(false);
    window.addEventListener('shield:performance-evaluation-updated', handleUpdate);

    return () => window.removeEventListener('shield:performance-evaluation-updated', handleUpdate);
  }, []);

  useEffect(() => {
    if (!isSupervisor) return;

    authService.getAccounts(currentUser.id)
      .then((response) => setAccounts(response.data.filter((account) => account.id !== currentUser.id)))
      .catch((error) => {
        console.error('Failed to load accounts for evaluations:', error);
      });
  }, [currentUser.id, isSupervisor]);

  const sentCount = useMemo(() => evaluations.filter((evaluation) => evaluation.status === 'Sent').length, [evaluations]);
  const signedCount = evaluations.length - sentCount;

  const createEvaluation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.employeeAccountId || !form.evaluationPeriod.trim()) {
      onToast('error', 'Choose an employee and enter an evaluation period.');
      return;
    }

    setIsSending(true);
    try {
      const response = await performanceEvaluationService.create(form);
      setEvaluations((items) => [response.data, ...items]);
      setSelectedId(response.data.id);
      setForm(emptyForm);
      setIsCreateOpen(false);
      onToast('success', 'Evaluation sent for signature.');
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to send evaluation.'));
    } finally {
      setIsSending(false);
    }
  };

  const updateEvaluation = (nextEvaluation: PerformanceEvaluation) => {
    setEvaluations((items) => items.map((item) => (item.id === nextEvaluation.id ? nextEvaluation : item)));
    setSelectedId(nextEvaluation.id);
  };

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Performance Evaluations</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Supervisors send evaluations for employees to review, sign, and return.
          </p>
        </div>
        {isSupervisor && (
          <button type="button" onClick={() => setIsCreateOpen(true)} className="btn-primary" aria-label="Create evaluation" title="Create Evaluation">
            <Plus size={16} />
          </button>
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-xs font-bold uppercase text-gray-400">Total</p>
          <p className="mt-1 text-3xl font-bold text-primary-500 dark:text-blue-100">{evaluations.length}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-xs font-bold uppercase text-gray-400">Awaiting Signature</p>
          <p className="mt-1 text-3xl font-bold text-accent">{sentCount}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <p className="text-xs font-bold uppercase text-gray-400">Signed</p>
          <p className="mt-1 text-3xl font-bold text-primary-500 dark:text-blue-100">{signedCount}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="loading">Loading evaluations...</div>
      ) : evaluations.length === 0 ? (
        <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">No performance evaluations yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <section className="space-y-2">
            {evaluations.map((evaluation) => (
              <button
                key={evaluation.id}
                type="button"
                onClick={() => setSelectedId(evaluation.id)}
                className={`w-full rounded border p-3 text-left transition hover:border-accent ${
                  selectedEvaluation?.id === evaluation.id
                    ? 'border-accent bg-accent/10'
                    : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-gray-900 dark:text-gray-100">{evaluation.employeeName}</p>
                    <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{evaluation.evaluationPeriod}</p>
                  </div>
                  {evaluation.status === 'Signed' ? <CheckCircle2 size={18} className="text-green-600" /> : <FileSignature size={18} className="text-accent" />}
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Supervisor: {evaluation.supervisorName}</p>
              </button>
            ))}
          </section>

          {selectedEvaluation && (
            <EvaluationDetail
              evaluation={selectedEvaluation}
              currentUser={currentUser}
              onSigned={updateEvaluation}
              onToast={onToast}
              getErrorMessage={getErrorMessage}
            />
          )}
        </div>
      )}

      {isCreateOpen && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="modal-window flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white p-4 shadow-2xl dark:bg-gray-900 sm:p-5">
            <div className="mb-4 flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 pb-4 dark:border-gray-800">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">New Performance Evaluation</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Fill out the evaluation and send it to the employee for signature.</p>
              </div>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="icon-close-button" aria-label="Close create evaluation" title="Close">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={createEvaluation} className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Employee</span>
                  <select
                    value={form.employeeAccountId}
                    onChange={(event) => setForm((current) => ({ ...current, employeeAccountId: event.target.value }))}
                    className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                  >
                    <option value="">Select employee</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.displayName} ({account.email})</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Evaluation Period</span>
                  <input value={form.evaluationPeriod} onChange={(event) => setForm((current) => ({ ...current, evaluationPeriod: event.target.value }))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" placeholder="2025 Annual" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Position / Rank</span>
                  <input value={form.positionTitle} onChange={(event) => setForm((current) => ({ ...current, positionTitle: event.target.value }))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">District / Unit</span>
                  <input value={form.district} onChange={(event) => setForm((current) => ({ ...current, district: event.target.value }))} className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950" />
                </label>
              </div>

              <section className="mt-5 rounded border border-gray-200 p-4 dark:border-gray-800">
                <h3 className="mb-3 text-base font-bold text-gray-900 dark:text-gray-100">Ratings</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {ratingFields.map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="mb-1 block text-xs font-bold uppercase text-gray-500 dark:text-gray-400">{label}</span>
                      <select
                        value={form.ratings[key]}
                        onChange={(event) => setForm((current) => ({ ...current, ratings: { ...current.ratings, [key]: event.target.value } }))}
                        className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                      >
                        {ratingOptions.map((option) => <option key={option}>{option}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </section>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                {[
                  ['strengths', 'Strengths'],
                  ['improvements', 'Areas for Improvement'],
                  ['goals', 'Goals / Next Steps'],
                  ['supervisorComments', 'Supervisor Comments'],
                ].map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</span>
                    <textarea
                      value={String(form[key as keyof typeof form])}
                      onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                      className="min-h-28 w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-5 flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-800">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="btn-secondary" aria-label="Cancel evaluation" title="Cancel">
                  <X size={16} />
                </button>
                <button type="submit" className="btn-primary" disabled={isSending} aria-label="Send evaluation" title={isSending ? 'Sending' : 'Send Evaluation'}>
                  <Send size={16} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default PerformanceEvaluationsPage;
