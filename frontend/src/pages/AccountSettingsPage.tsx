import QRCode from 'qrcode';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Camera, Download, KeyRound, LogOut, QrCode, Save, ShieldCheck, Smartphone, UserCircle, X } from 'lucide-react';
import { AuthAccount, AuthSession, PerformanceEvaluation, TwoFactorSetupResponse, authService, performanceEvaluationService, userService } from '../services/api';

interface AccountSettingsPageProps {
  account: AuthAccount;
  messagePreferences: {
    receiveMessages: boolean;
    playMessageSound: boolean;
  };
  onReceiveMessagesChange: (receiveMessages: boolean) => void;
  onMessageSoundChange: (playMessageSound: boolean) => void;
  onAccountUpdate: (account: AuthAccount) => void;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
}

function getAccountInitials(account: AuthAccount): string {
  const source = account.displayName?.trim() || account.email?.trim() || 'User';
  const parts = source.split(/\s+/u).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function AccountSettingsPage({
  account,
  messagePreferences,
  onReceiveMessagesChange,
  onMessageSoundChange,
  onAccountUpdate,
  onToast,
  getErrorMessage,
}: AccountSettingsPageProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetupResponse | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);
  const [isTwoFactorSaving, setIsTwoFactorSaving] = useState(false);
  const [isProfilePictureSaving, setIsProfilePictureSaving] = useState(false);
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [isRevokingSessions, setIsRevokingSessions] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'reports' | 'preferences'>('general');
  const profilePictureInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!twoFactorSetup) {
      setQrCodeDataUrl('');
      return;
    }

    QRCode.toDataURL(twoFactorSetup.otpauthUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 220,
    })
      .then((dataUrl) => {
        if (isMounted) {
          setQrCodeDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (isMounted) {
          onToast('error', 'Failed to generate 2FA QR code.');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [onToast, twoFactorSetup]);

  const loadSessions = async () => {
    setIsSessionsLoading(true);
    try {
      const response = await authService.getSessions();
      setSessions(response.data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      onToast('error', getErrorMessage(error, 'Failed to load sessions.'));
    } finally {
      setIsSessionsLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const revokeSession = async (sessionId: string) => {
    setIsRevokingSessions(true);
    try {
      await authService.revokeSession(sessionId);
      setSessions((items) => items.filter((session) => session.id !== sessionId));
      onToast('success', 'Session revoked.');
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to revoke session.'));
    } finally {
      setIsRevokingSessions(false);
    }
  };

  const revokeOtherSessions = async () => {
    setIsRevokingSessions(true);
    try {
      const response = await authService.revokeOtherSessions();
      await loadSessions();
      onToast('success', `${response.data.revokedCount} session${response.data.revokedCount === 1 ? '' : 's'} revoked.`);
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to revoke other sessions.'));
    } finally {
      setIsRevokingSessions(false);
    }
  };

  const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (newPassword !== confirmNewPassword) {
      onToast('error', 'New passwords do not match.');
      return;
    }

    setIsPasswordSaving(true);

    try {
      await authService.changePassword(account.id, currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      onToast('success', 'Password updated.');
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to update password.'));
    } finally {
      setIsPasswordSaving(false);
    }
  };

  const handleSetupTwoFactor = async () => {
    setIsTwoFactorSaving(true);

    try {
      const response = await authService.setupTwoFactor(account.id);
      setTwoFactorSetup(response.data);
      onToast('info', 'Add the secret to your authenticator app, then enter the code.');
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to start 2FA setup.'));
    } finally {
      setIsTwoFactorSaving(false);
    }
  };

  const handleProfilePictureChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProfilePictureSaving(true);

    try {
      const response = await userService.uploadProfilePicture(account.id, file);
      onAccountUpdate({ ...account, profilePictureUrl: response.data.profilePictureUrl });
      onToast('success', 'Profile picture updated.');
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to update profile picture.'));
    } finally {
      setIsProfilePictureSaving(false);
      event.target.value = '';
    }
  };

  const handleEnableTwoFactor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsTwoFactorSaving(true);

    try {
      const response = await authService.enableTwoFactor(account.id, twoFactorCode);
      if (response.data.account) {
        onAccountUpdate(response.data.account);
      }
      setTwoFactorSetup(null);
      setTwoFactorCode('');
      onToast('success', 'Two-factor authentication enabled.');
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Invalid verification code.'));
    } finally {
      setIsTwoFactorSaving(false);
    }
  };

  const handleDisableTwoFactor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsTwoFactorSaving(true);

    try {
      const response = await authService.disableTwoFactor(account.id, disablePassword);
      if (response.data.account) {
        onAccountUpdate(response.data.account);
      }
      setDisablePassword('');
      onToast('success', 'Two-factor authentication disabled.');
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to disable 2FA.'));
    } finally {
      setIsTwoFactorSaving(false);
    }
  };

  const downloadFile = (filename: string, contents: string, type: string) => {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const escapePdfText = (value: unknown) =>
    String(value ?? '')
      .replace(/\\/gu, '\\\\')
      .replace(/\(/gu, '\\(')
      .replace(/\)/gu, '\\)')
      .replace(/\r?\n/gu, ' ');

  const wrapPdfText = (label: string, value: unknown, maxLength = 86) => {
    const text = `${label}: ${String(value ?? 'Not recorded')}`;
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
  };

  const createPerformanceEvaluationPdf = (evaluations: PerformanceEvaluation[]) => {
    const lines = evaluations.length > 0
      ? evaluations.flatMap((evaluation, index) => [
          `Performance Evaluation ${index + 1}`,
          ...wrapPdfText('Employee', evaluation.employeeName),
          ...wrapPdfText('Employee Email', evaluation.employeeEmail),
          ...wrapPdfText('Supervisor', evaluation.supervisorName),
          ...wrapPdfText('Period', evaluation.evaluationPeriod),
          ...wrapPdfText('Position', evaluation.positionTitle),
          ...wrapPdfText('District', evaluation.district),
          ...wrapPdfText('Status', evaluation.status),
          ...wrapPdfText('Sent', evaluation.sentAt ? new Date(evaluation.sentAt).toLocaleString() : ''),
          ...wrapPdfText('Employee Signed', evaluation.employeeSignedAt ? new Date(evaluation.employeeSignedAt).toLocaleString() : ''),
          ...wrapPdfText('Supervisor Signature', evaluation.supervisorSignature),
          ...wrapPdfText('Employee Signature', evaluation.employeeSignature),
          ...wrapPdfText('Strengths', evaluation.strengths),
          ...wrapPdfText('Improvements', evaluation.improvements),
          ...wrapPdfText('Goals', evaluation.goals),
          ...wrapPdfText('Supervisor Comments', evaluation.supervisorComments),
          ...wrapPdfText('Employee Comments', evaluation.employeeComments),
          '',
        ])
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
    const catalogId = addObject('<< /Type /Catalog /Pages 2 0 R >>');
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
    void catalogId;

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
  };

  const downloadPerformanceEvaluations = async () => {
    try {
      const response = await performanceEvaluationService.getAll();
      const evaluations = response.data.filter(
        (evaluation) => evaluation.employeeAccountId === account.id || evaluation.supervisorAccountId === account.id,
      );

      downloadFile('shield-performance-evaluations.pdf', createPerformanceEvaluationPdf(evaluations), 'application/pdf');
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to download performance reports.'));
    }
  };

  return (
    <div className="space-y-3 pb-1">
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3 dark:border-gray-800">
        {[
          ['general', 'General'],
          ['reports', 'Reports & Data'],
          ['preferences', 'Preferences'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id as typeof activeTab)}
            className={`rounded px-3 py-2 text-sm font-bold transition ${
              activeTab === id
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
      <>
      <section className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              onClick={() => profilePictureInputRef.current?.click()}
              className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-gray-200 bg-white text-accent dark:border-gray-700 dark:bg-gray-900"
              aria-label="Update profile picture"
              title="Update profile picture"
              disabled={isProfilePictureSaving}
            >
              {account.profilePictureUrl ? (
                <img
                  src={account.profilePictureUrl}
                  alt={account.displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-base font-bold">
                  {getAccountInitials(account) || <UserCircle size={28} />}
                </span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
                <Camera size={18} />
              </span>
            </button>
            <input
              ref={profilePictureInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleProfilePictureChange}
            />
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold text-gray-900 dark:text-gray-100">{account.displayName}</h3>
              <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                {isProfilePictureSaving ? 'Updating profile picture...' : account.email}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold uppercase text-accent">
              {account.role || 'user'}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                account.twoFactorEnabled
                  ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-200'
                  : 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              {account.twoFactorEnabled ? '2FA enabled' : '2FA off'}
            </span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800 sm:p-4">
          <div className="mb-3 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-accent/10 text-accent">
              <KeyRound size={19} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Password</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Update the password used to sign in.</p>
            </div>
          </div>

          <form onSubmit={handlePasswordChange} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="w-full rounded border-2 border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
                autoComplete="current-password"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full rounded border-2 border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
                autoComplete="new-password"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Confirm new password</span>
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
                className="w-full rounded border-2 border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
                autoComplete="new-password"
              />
            </label>

            <button type="submit" className="btn-primary" disabled={isPasswordSaving} aria-label="Update password" title={isPasswordSaving ? 'Saving' : 'Update Password'}>
              <Save size={16} />
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800 sm:p-4">
          <div className="mb-3 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-accent/10 text-accent">
              <ShieldCheck size={19} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Authenticator App</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Use Google Authenticator, Microsoft Authenticator, or another TOTP app.</p>
            </div>
          </div>

          {!account.twoFactorEnabled && !twoFactorSetup && (
            <div className="rounded border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
              <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                Add an authenticator app to require a one-time code during sign in.
              </p>
              <button type="button" className="btn-primary" onClick={handleSetupTwoFactor} disabled={isTwoFactorSaving} aria-label="Set up authenticator app" title={isTwoFactorSaving ? 'Starting' : 'Set Up Authenticator App'}>
                <Smartphone size={16} />
              </button>
            </div>
          )}

          {!account.twoFactorEnabled && twoFactorSetup && (
            <form onSubmit={handleEnableTwoFactor} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 rounded border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
                <div className="flex items-center justify-center rounded border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 sm:p-4">
                  {qrCodeDataUrl ? (
                    <img src={qrCodeDataUrl} alt="Authenticator setup QR code" className="h-44 w-44 sm:h-56 sm:w-56" />
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <QrCode size={18} /> Generating QR code...
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Secret key</p>
                  <code className="block break-all rounded bg-white p-3 text-sm dark:bg-gray-900">{twoFactorSetup.secret}</code>
                </div>
              </div>

              <label className="block max-w-xs">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Verification code</span>
                <input
                  value={twoFactorCode}
                  onChange={(event) => setTwoFactorCode(event.target.value)}
                  className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </label>

              <button type="submit" className="btn-primary" disabled={isTwoFactorSaving} aria-label="Enable two-factor authentication" title={isTwoFactorSaving ? 'Verifying' : 'Enable 2FA'}>
                <ShieldCheck size={16} />
              </button>
            </form>
          )}

          {account.twoFactorEnabled && (
            <form onSubmit={handleDisableTwoFactor} className="space-y-4">
              <div className="rounded border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
                Authenticator app 2FA is currently enabled for this account.
              </div>

              <label className="block max-w-md">
                <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Password</span>
                <input
                  type="password"
                  value={disablePassword}
                  onChange={(event) => setDisablePassword(event.target.value)}
                  className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
                  autoComplete="current-password"
                />
              </label>

              <button type="submit" className="btn-danger" disabled={isTwoFactorSaving} aria-label="Disable two-factor authentication" title={isTwoFactorSaving ? 'Disabling' : 'Disable 2FA'}>
                <X size={16} />
              </button>
            </form>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-gray-200 p-3 dark:border-gray-800 sm:p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-accent/10 text-accent">
              <LogOut size={19} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Active Sessions</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Review sign-ins and revoke sessions you no longer use.</p>
            </div>
          </div>
          <button type="button" onClick={revokeOtherSessions} className="btn-danger" disabled={isRevokingSessions || sessions.filter((session) => !session.isCurrent).length === 0} aria-label="Revoke other sessions" title="Revoke Others">
            <LogOut size={16} />
          </button>
        </div>

        {isSessionsLoading ? (
          <div className="loading">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">No active sessions found.</div>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-200 p-3 dark:border-gray-800">
                <div>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
                    {session.isCurrent ? 'Current session' : 'Signed-in session'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Created {new Date(session.createdAt).toLocaleString()} - Expires {new Date(session.expiresAt).toLocaleString()}
                  </p>
                </div>
                {!session.isCurrent && (
                  <button
                    type="button"
                    onClick={() => revokeSession(session.id)}
                    className="flex h-9 w-9 items-center justify-center rounded border border-red-200 text-danger hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                    aria-label="Revoke session"
                    title="Revoke session"
                    disabled={isRevokingSessions}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      </>
      )}

      {activeTab === 'reports' && (
        <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Reports & Data</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Download account-related records for review or offline files.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded border border-gray-200 p-3 dark:border-gray-800">
              <p className="font-bold text-gray-900 dark:text-gray-100">Performance Evaluations</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Download evaluations you sent or received.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={downloadPerformanceEvaluations} className="btn-primary" aria-label="Download performance evaluations PDF" title="Download PDF">
                  <Download size={16} />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'preferences' && (
        <section className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Preferences</h3>
          <label className="flex items-center justify-between gap-4 rounded border border-gray-200 p-4 dark:border-gray-800">
            <span>
              <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">Receive messages</span>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Show message badges and message notifications.</span>
            </span>
            <input
              type="checkbox"
              checked={messagePreferences.receiveMessages}
              onChange={(event) => onReceiveMessagesChange(event.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between gap-4 rounded border border-gray-200 p-4 dark:border-gray-800">
            <span>
              <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">Message ping sound</span>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Play a short sound when new unread messages arrive.</span>
            </span>
            <input
              type="checkbox"
              checked={messagePreferences.playMessageSound}
              disabled={!messagePreferences.receiveMessages}
              onChange={(event) => onMessageSoundChange(event.target.checked)}
            />
          </label>
        </section>
      )}
    </div>
  );
}
