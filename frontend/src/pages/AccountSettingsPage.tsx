import QRCode from 'qrcode';
import { FormEvent, useEffect, useState } from 'react';
import { AuthAccount, TwoFactorSetupResponse, authService } from '../services/api';

interface AccountSettingsPageProps {
  account: AuthAccount;
  onAccountUpdate: (account: AuthAccount) => void;
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
}

export function AccountSettingsPage({
  account,
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

  return (
    <div>
      <h1 className="mb-8">Account Settings</h1>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-lg bg-white p-6 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
          <h2 className="mb-2">Profile</h2>
          <div className="mt-5 space-y-3 text-sm">
            <p><span className="font-semibold text-gray-700 dark:text-gray-300">Name:</span> {account.displayName}</p>
            <p><span className="font-semibold text-gray-700 dark:text-gray-300">Email:</span> {account.email}</p>
            <p>
              <span className="font-semibold text-gray-700 dark:text-gray-300">2FA:</span>{' '}
              {account.twoFactorEnabled ? 'Enabled' : 'Not enabled'}
            </p>
          </div>
        </section>

        <section className="rounded-lg bg-white p-6 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
          <h2 className="mb-2">Reset Password</h2>
          <form onSubmit={handlePasswordChange} className="mt-5 space-y-4">
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="Current password"
              className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
              autoComplete="current-password"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="New password"
              className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
              autoComplete="new-password"
            />
            <input
              type="password"
              value={confirmNewPassword}
              onChange={(event) => setConfirmNewPassword(event.target.value)}
              placeholder="Confirm new password"
              className="w-full rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
              autoComplete="new-password"
            />
            <button type="submit" className="btn-primary" disabled={isPasswordSaving}>
              {isPasswordSaving ? 'Saving...' : 'Update Password'}
            </button>
          </form>
        </section>

        <section className="rounded-lg bg-white p-6 shadow xl:col-span-2 dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
          <h2 className="mb-2">Authenticator App 2FA</h2>
          <p className="mb-5 text-sm text-gray-600 dark:text-gray-400">
            Use Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP app.
          </p>

          {!account.twoFactorEnabled && !twoFactorSetup && (
            <button type="button" className="btn-primary" onClick={handleSetupTwoFactor} disabled={isTwoFactorSaving}>
              {isTwoFactorSaving ? 'Starting...' : 'Set Up Authenticator App'}
            </button>
          )}

          {!account.twoFactorEnabled && twoFactorSetup && (
            <form onSubmit={handleEnableTwoFactor} className="space-y-4">
              <div className="grid grid-cols-1 gap-5 rounded border border-gray-300 bg-gray-50 p-4 lg:grid-cols-[260px_minmax(0,1fr)] dark:border-gray-700 dark:bg-gray-950">
                <div className="flex items-center justify-center rounded bg-white p-5 dark:bg-gray-900">
                  {qrCodeDataUrl ? (
                    <img src={qrCodeDataUrl} alt="Authenticator setup QR code" className="h-56 w-56" />
                  ) : (
                    <div className="loading">Generating QR code...</div>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Secret key</p>
                  <code className="block break-all rounded bg-white p-3 text-sm dark:bg-gray-900">{twoFactorSetup.secret}</code>
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">Manual setup URI:</p>
                  <code className="block break-all rounded bg-white p-3 text-xs dark:bg-gray-900">{twoFactorSetup.otpauthUrl}</code>
                </div>
              </div>
              <input
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(event.target.value)}
                placeholder="6-digit code"
                className="w-full max-w-xs rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
                inputMode="numeric"
              />
              <div>
                <button type="submit" className="btn-primary" disabled={isTwoFactorSaving}>
                  {isTwoFactorSaving ? 'Verifying...' : 'Enable 2FA'}
                </button>
              </div>
            </form>
          )}

          {account.twoFactorEnabled && (
            <form onSubmit={handleDisableTwoFactor} className="flex flex-col gap-3 sm:max-w-md">
              <p className="text-sm text-success">Authenticator app 2FA is currently enabled.</p>
              <input
                type="password"
                value={disablePassword}
                onChange={(event) => setDisablePassword(event.target.value)}
                placeholder="Password to disable 2FA"
                className="rounded border-2 border-gray-300 px-4 py-3 text-sm outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-950"
                autoComplete="current-password"
              />
              <button type="submit" className="btn-danger w-fit" disabled={isTwoFactorSaving}>
                {isTwoFactorSaving ? 'Disabling...' : 'Disable 2FA'}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
