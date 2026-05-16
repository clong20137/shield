import QRCode from 'qrcode';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Camera, KeyRound, QrCode, ShieldCheck, UserCircle } from 'lucide-react';
import { AuthAccount, MileageSummary, TwoFactorSetupResponse, authService, mileageService, userService } from '../services/api';

interface AccountSettingsPageProps {
  account: AuthAccount;
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
  const [mileageSummary, setMileageSummary] = useState<MileageSummary | null>(null);
  const [milestoneInput, setMilestoneInput] = useState('');
  const [isMilestoneSaving, setIsMilestoneSaving] = useState(false);
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

  useEffect(() => {
    mileageService.getSummary()
      .then((response) => {
        setMileageSummary(response.data);
        setMilestoneInput(String(response.data.milestone));
      })
      .catch((error) => {
        console.error('Failed to load mileage summary:', error);
      });
  }, []);

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

  const saveMileageMilestone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const milestone = Number(milestoneInput);

    if (!Number.isFinite(milestone) || milestone <= 0) {
      onToast('error', 'Mileage milestone must be greater than zero.');
      return;
    }

    setIsMilestoneSaving(true);
    try {
      const response = await mileageService.updateMilestone(milestone);
      setMileageSummary((summary) => ({ mileage: summary?.mileage || 0, milestone: response.data.milestone }));
      onToast('success', 'Mileage milestone updated.');
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to update mileage milestone.'));
    } finally {
      setIsMilestoneSaving(false);
    }
  };

  const mileage = mileageSummary?.mileage || 0;
  const milestone = mileageSummary?.milestone || 1000;
  const mileagePercent = Math.min((mileage / milestone) * 100, 100);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
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

      <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Mileage Progress</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Recorded from Regular Duty Miles in Trooper Daily entries.</p>
          </div>
          <span className="rounded bg-accent/10 px-3 py-1 text-sm font-bold text-accent">
            {mileage.toFixed(1).replace(/\.0$/u, '')} / {milestone.toFixed(0)} miles
          </span>
        </div>
        <div className="h-4 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${mileagePercent}%` }} />
        </div>
        <p className="mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
          {mileage >= milestone ? 'Milestone reached.' : `${(milestone - mileage).toFixed(1).replace(/\.0$/u, '')} miles remaining.`}
        </p>

        {account.role === 'administrator' && (
          <form onSubmit={saveMileageMilestone} className="mt-4 flex flex-wrap items-end gap-3">
            <label>
              <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Admin mileage milestone</span>
              <input
                type="number"
                min="1"
                step="1"
                value={milestoneInput}
                onChange={(event) => setMilestoneInput(event.target.value)}
                className="w-48 rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
              />
            </label>
            <button type="submit" className="btn-primary" disabled={isMilestoneSaving}>
              {isMilestoneSaving ? 'Saving...' : 'Save Milestone'}
            </button>
          </form>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
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

            <button type="submit" className="btn-primary" disabled={isPasswordSaving}>
              {isPasswordSaving ? 'Saving...' : 'Update Password'}
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
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
              <button type="button" className="btn-primary" onClick={handleSetupTwoFactor} disabled={isTwoFactorSaving}>
                {isTwoFactorSaving ? 'Starting...' : 'Set Up Authenticator App'}
              </button>
            </div>
          )}

          {!account.twoFactorEnabled && twoFactorSetup && (
            <form onSubmit={handleEnableTwoFactor} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 rounded border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
                <div className="flex items-center justify-center rounded border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                  {qrCodeDataUrl ? (
                    <img src={qrCodeDataUrl} alt="Authenticator setup QR code" className="h-56 w-56" />
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

              <button type="submit" className="btn-primary" disabled={isTwoFactorSaving}>
                {isTwoFactorSaving ? 'Verifying...' : 'Enable 2FA'}
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

              <button type="submit" className="btn-danger" disabled={isTwoFactorSaving}>
                {isTwoFactorSaving ? 'Disabling...' : 'Disable 2FA'}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
