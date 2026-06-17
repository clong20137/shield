import { FormEvent, useEffect, useRef, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { calendarService } from '../services/api';

interface TCodeOptionsPageProps {
  onToast: (type: 'success' | 'error' | 'info', message: string) => void;
  getErrorMessage: (error: unknown, fallback: string) => string;
}

function normalizeOptions(options: string[]) {
  return Array.from(new Set(options.map((option) => option.trim()).filter(Boolean)));
}

export default function TCodeOptionsPage({ onToast, getErrorMessage }: TCodeOptionsPageProps) {
  const [options, setOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newOption, setNewOption] = useState('');
  const getErrorMessageRef = useRef(getErrorMessage);
  const onToastRef = useRef(onToast);

  useEffect(() => {
    getErrorMessageRef.current = getErrorMessage;
    onToastRef.current = onToast;
  }, [getErrorMessage, onToast]);

  useEffect(() => {
    let isMounted = true;
    calendarService.getTCodeOptions()
      .then((response) => {
        if (isMounted) {
          setOptions(response.data.options);
        }
      })
      .catch((error) => {
        if (isMounted) {
          onToastRef.current('error', getErrorMessageRef.current(error, 'Failed to load T-Code options.'));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const addOption = () => {
    const option = newOption.trim();
    if (!option) {
      return;
    }

    setOptions((currentOptions) => normalizeOptions([...currentOptions, option]));
    setNewOption('');
  };

  const saveOptions = async (event: FormEvent) => {
    event.preventDefault();
    const optionsToSave = normalizeOptions([...options, newOption]);
    setIsSaving(true);
    try {
      const response = await calendarService.updateTCodeOptions(optionsToSave);
      setOptions(response.data.options);
      setNewOption('');
      onToast('success', 'T-Code options saved.');
    } catch (error) {
      onToast('error', getErrorMessage(error, 'Failed to save T-Code options.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-lg bg-white p-5 shadow dark:bg-gray-900 dark:shadow-none dark:ring-1 dark:ring-gray-800">
      <div className="mb-5">
        <h2>T-Code Options</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage the dropdown options used in the Trooper Daily T-Codes section.
        </p>
      </div>

      {isLoading ? (
        <div className="loading">Loading T-Code options...</div>
      ) : (
        <form onSubmit={saveOptions} className="space-y-4">
          <div className="space-y-2">
            {options.length === 0 ? (
              <div className="empty-state rounded border border-dashed border-gray-300 dark:border-gray-700">No T-Code options yet.</div>
            ) : (
              options.map((option, index) => (
                <div key={`${option}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <input
                    value={option}
                    onChange={(event) => {
                      const value = event.target.value;
                      setOptions((currentOptions) => currentOptions.map((currentOption, currentIndex) => currentIndex === index ? value : currentOption));
                    }}
                    className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
                    aria-label={`T-Code option ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => setOptions((currentOptions) => currentOptions.filter((_, currentIndex) => currentIndex !== index))}
                    className="btn-danger"
                    aria-label={`Delete ${option || `option ${index + 1}`}`}
                    title="Delete Option"
                  >
                    <Trash2 size={16} />
                    <span>Delete</span>
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t border-gray-200 pt-4 dark:border-gray-800">
            <input
              value={newOption}
              onChange={(event) => setNewOption(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addOption();
                }
              }}
              placeholder="Add T-Code option"
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
            />
            <button type="button" onClick={addOption} className="btn-secondary" aria-label="Add T-Code option" title="Add Option">
              <Plus size={16} />
              <span>Add</span>
            </button>
          </div>

          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={isSaving} aria-label="Save T-Code options" title="Save T-Code Options">
              <Save size={16} />
              <span>{isSaving ? 'Saving...' : 'Save Options'}</span>
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
