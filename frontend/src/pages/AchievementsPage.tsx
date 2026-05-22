import { FormEvent, useEffect, useState } from 'react';
import { Award, Flag, Gauge, Medal, Plus, Save, ShieldCheck, Star, Trash2, Trophy, X } from 'lucide-react';
import { MileageAchievement, mileageService } from '../services/api';

interface AchievementsPageProps {
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
}

const achievementIcons = [
  { value: 'gauge', label: 'Gauge', icon: Gauge },
  { value: 'trophy', label: 'Trophy', icon: Trophy },
  { value: 'star', label: 'Star', icon: Star },
  { value: 'medal', label: 'Medal', icon: Medal },
  { value: 'flag', label: 'Flag', icon: Flag },
  { value: 'shield', label: 'Shield', icon: ShieldCheck },
  { value: 'award', label: 'Award', icon: Award },
] as const;

const emptyForm = { title: '', mileage: 1000, icon: 'gauge' };

export function getAchievementIcon(icon: string) {
  return achievementIcons.find((item) => item.value === icon)?.icon || Gauge;
}

function AchievementsPage({ onToast, getErrorMessage }: AchievementsPageProps) {
  const [achievements, setAchievements] = useState<MileageAchievement[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<MileageAchievement | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAchievements = async (showLoading = true) => {
    if (showLoading) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await mileageService.getAchievements();
      setAchievements(response.data);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to load achievements.');
      setError(message);
      onToast('error', message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAchievements();

    const handleMileageUpdate = () => void loadAchievements(false);
    window.addEventListener('shield:mileage-updated', handleMileageUpdate);
    return () => window.removeEventListener('shield:mileage-updated', handleMileageUpdate);
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditing(null);
  };

  const submitAchievement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.title.trim()) {
      onToast('error', 'Achievement title is required.');
      return;
    }

    if (!Number.isFinite(form.mileage) || form.mileage <= 0) {
      onToast('error', 'Mileage must be greater than zero.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const payload = { title: form.title.trim(), mileage: form.mileage, icon: form.icon };
      const response = editing
        ? await mileageService.updateAchievement(editing.id, payload)
        : await mileageService.createAchievement(payload);

      setAchievements((items) => {
        const next = editing
          ? items.map((item) => (item.id === editing.id ? response.data : item))
          : [...items, response.data];
        return next.sort((a, b) => a.mileage - b.mileage || a.title.localeCompare(b.title));
      });
      resetForm();
      onToast('success', editing ? 'Achievement updated.' : 'Achievement created.');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to save achievement.');
      setError(message);
      onToast('error', message);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteAchievement = async (achievement: MileageAchievement) => {
    setIsSaving(true);
    setError(null);
    try {
      await mileageService.deleteAchievement(achievement.id);
      setAchievements((items) => items.filter((item) => item.id !== achievement.id));
      if (editing?.id === achievement.id) {
        resetForm();
      }
      onToast('success', 'Achievement deleted.');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to delete achievement.');
      setError(message);
      onToast('error', message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Achievements</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Create mileage milestones shown on user profiles.</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <form onSubmit={submitAchievement} className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 md:grid-cols-[minmax(0,1.4fr)_160px_190px_auto_auto]">
        <label>
          <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Achievement Name</span>
          <input
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
            placeholder="5,000 Mile Mark"
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Miles</span>
          <input
            type="number"
            min={1}
            step={1}
            value={form.mileage}
            onChange={(event) => setForm((current) => ({ ...current, mileage: Math.max(1, Number(event.target.value) || 1) }))}
            className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          />
        </label>
        <label>
          <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-300">Icon</span>
          <select
            value={form.icon}
            onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))}
            className="w-full rounded border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-950"
          >
            {achievementIcons.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-primary self-end" disabled={isSaving} aria-label={editing ? 'Save achievement' : 'Create achievement'} title={editing ? 'Save Achievement' : 'Create Achievement'}>
          {editing ? <Save size={16} /> : <Plus size={16} />}
        </button>
        {editing && (
          <button type="button" onClick={resetForm} className="btn-secondary self-end" aria-label="Cancel edit achievement" title="Cancel">
            <X size={16} />
          </button>
        )}
      </form>

      <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        {isLoading ? (
          <div className="loading">Loading achievements...</div>
        ) : achievements.length === 0 ? (
          <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">No achievements yet.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {achievements.map((achievement) => {
              const Icon = getAchievementIcon(achievement.icon);
              return (
                <div key={achievement.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-accent/10 text-accent">
                        <Icon size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-gray-900 dark:text-gray-100">{achievement.title}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{achievement.mileage.toLocaleString()} miles</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setEditing(achievement); setForm({ title: achievement.title, mileage: achievement.mileage, icon: achievement.icon }); }} className="btn-secondary" aria-label={`Edit ${achievement.title}`} title="Edit">
                        <Save size={16} />
                      </button>
                      <button type="button" onClick={() => deleteAchievement(achievement)} className="btn-danger" disabled={isSaving} aria-label={`Delete ${achievement.title}`} title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default AchievementsPage;
