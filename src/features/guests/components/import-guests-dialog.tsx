'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { downloadGuestCsv, importGuestRows } from '@/features/guests/api';
import { guestsKey } from '@/features/guests/hooks';
import {
  IMPORT_FIELDS,
  guessMapping,
  mapGuestRows,
  readGuestFile,
  type GuestFile,
  type ColumnMapping,
} from '@/features/guests/import-file';
import { weddingKey } from '@/features/weddings/hooks';
import type { HouseholdImportResult } from '@/modules/households/households.types';
import { makeCsv } from '@/shared/csv';

export function ImportGuestsDialog({
  weddingId,
  events,
  sideScope,
  onClose,
  onImported,
}: {
  weddingId: string;
  events: { id: string; name: string }[];
  sideScope: string | null;
  onClose: () => void;
  onImported: (created: number) => void;
}) {
  const client = useQueryClient();
  const [file, setFile] = useState<GuestFile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [createTags, setCreateTags] = useState(true);
  const [preview, setPreview] = useState<HouseholdImportResult | null>(null);
  const [result, setResult] = useState<HouseholdImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [confirmDuplicates, setConfirmDuplicates] = useState(false);
  const [started, setStarted] = useState(false);
  const rows = file ? mapGuestRows(file, mapping, events, sideScope) : [];
  const resetPreview = () => {
    setPreview(null);
    setConfirmDuplicates(false);
    setError(null);
  };
  const duplicates =
    (preview?.possibleDuplicates.length ?? 0) + (preview?.duplicateRows.length ?? 0);

  async function validate() {
    setBusy(true);
    setError(null);
    try {
      setPreview(await importGuestRows(weddingId, rows, true, createTags));
      setConfirmDuplicates(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not validate the file.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setStarted(true);
    const combined: HouseholdImportResult = {
      importBatchId: null,
      created: 0,
      failed: 0,
      valid: 0,
      errors: [],
      possibleDuplicates: [],
      duplicateRows: [],
    };
    try {
      for (let offset = 0; offset < rows.length; offset += 50) {
        setProgress(
          `Importing families ${offset + 1}–${Math.min(offset + 50, rows.length)} of ${rows.length}…`,
        );
        const batch = await importGuestRows(
          weddingId,
          rows.slice(offset, offset + 50),
          false,
          createTags,
        );
        combined.created += batch.created;
        combined.failed += batch.failed;
        combined.valid += batch.valid;
        combined.errors.push(...batch.errors.map((e) => ({ ...e, row: e.row + offset })));
        setResult({ ...combined });
      }
      setProgress('Import finished.');
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : 'Connection interrupted.'} Some families may already be saved. Close this dialog and review your guest list before starting another import.`,
      );
      setResult({ ...combined });
    } finally {
      setBusy(false);
      void client.invalidateQueries({ queryKey: guestsKey(weddingId) });
      void client.invalidateQueries({ queryKey: weddingKey(weddingId), exact: true });
      void client.invalidateQueries({ queryKey: ['weddings', weddingId, 'events'] });
      onImported(combined.created);
    }
  }

  function errorsCsv() {
    const report = result ?? preview;
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          makeCsv([
            ['File row', 'Field', 'Error'],
            ...report.errors.map((e) => [e.row + 1, e.path, e.message]),
          ]),
        ],
        { type: 'text/csv;charset=utf-8' },
      ),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'guest-import-errors.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title="Import guest families"
      description="CSV or Excel (.xlsx), up to 1,000 families and 5 MB. Excel uses the first worksheet."
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {started ? 'Done' : 'Cancel'}
          </Button>
          {!started &&
            (preview ? (
              <Button
                disabled={busy || !preview.valid || (duplicates > 0 && !confirmDuplicates)}
                onClick={save}
              >
                {busy
                  ? 'Importing…'
                  : `Import ${preview.valid} valid ${preview.valid === 1 ? 'family' : 'families'}`}
              </Button>
            ) : (
              <Button
                disabled={busy || !file || mapping.displayName === undefined}
                onClick={validate}
              >
                {busy ? 'Checking…' : 'Preview import'}
              </Button>
            ))}
        </>
      }
    >
      <div className="space-y-5 text-sm">
        {error && (
          <p role="alert" className="bg-danger-bg text-danger-text rounded-input p-3">
            {error}
          </p>
        )}
        {progress && <p role="status">{progress}</p>}
        {!started && (
          <>
            <Button
              variant="link"
              onClick={async () => {
                try {
                  await downloadGuestCsv(weddingId, 'import-template');
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not download template.');
                }
              }}
            >
              Download CSV template
            </Button>
            <p>
              Use semicolons between member names, tags and events. Events can be existing event
              names or IDs. Save phones as text in Excel to keep the country code and leading zeros.
            </p>
            {sideScope && <p>Your imported families will be on the {sideScope} side.</p>}
            <label className="block space-y-2">
              <span className="font-medium">Guest file</span>
              <input
                className="block w-full"
                type="file"
                accept=".csv,.xlsx"
                disabled={busy}
                onChange={async (e) => {
                  const selected = e.target.files?.[0];
                  if (!selected) return;
                  setBusy(true);
                  resetPreview();
                  setFile(null);
                  try {
                    const parsed = await readGuestFile(selected);
                    setFile(parsed);
                    setMapping(guessMapping(parsed.headers));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Could not read this file.');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            {file && (
              <>
                <p>
                  {file.rows.length} families found. Map your file columns below. Unmapped fields
                  are left blank; headcount defaults to the member count, or 1.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {IMPORT_FIELDS.map(([field, label]) => (
                    <label key={field} className="space-y-1">
                      <span className="block">{label}</span>
                      <select
                        className="border-border rounded-input w-full border p-2"
                        disabled={busy || (field === 'side' && !!sideScope)}
                        value={mapping[field] ?? ''}
                        onChange={(e) => {
                          setMapping((m) => ({
                            ...m,
                            [field]: e.target.value === '' ? undefined : Number(e.target.value),
                          }));
                          resetPreview();
                        }}
                      >
                        <option value="">Do not import</option>
                        {file.headers.map((header, i) => (
                          <option key={i} value={i}>
                            {header || `Column ${i + 1}`} (column {i + 1})
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={createTags}
                    disabled={busy}
                    onChange={(e) => {
                      setCreateTags(e.target.checked);
                      resetPreview();
                    }}
                  />
                  Create tags that do not exist yet
                </label>
              </>
            )}
          </>
        )}
        {preview && !started && (
          <>
            <p className="font-medium">
              {preview.valid} valid families · {preview.failed} invalid families
            </p>
            <p>Invalid rows are skipped. No families have been saved yet.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th>File row</th>
                    <th>Family</th>
                    <th>People</th>
                    <th>Side</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      <td>{i + 2}</td>
                      <td>{row.displayName}</td>
                      <td>{row.headcount ?? Math.max(row.members.length, 1)}</td>
                      <td>{row.side ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 10 && <p>Showing the first 10 rows. All rows were checked.</p>}
            {duplicates > 0 && (
              <div className="bg-pending-bg text-pending-text rounded-input space-y-2 p-3">
                <p>
                  Possible duplicates found: {preview.possibleDuplicates.length} matches with saved
                  families and {preview.duplicateRows.length} repeated rows within this file.
                  Importing creates additional families; it does not update existing ones.
                </p>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={confirmDuplicates}
                    onChange={(e) => setConfirmDuplicates(e.target.checked)}
                  />
                  I reviewed the duplicates and want to import them anyway.
                </label>
              </div>
            )}
          </>
        )}
        {result && (
          <p role="status" className="font-medium">
            {result.created} families imported · {result.failed} failed
          </p>
        )}
        {(result ?? preview)?.errors.length ? (
          <div className="space-y-2">
            <Button variant="outline" onClick={errorsCsv}>
              Download row errors
            </Button>
            <ul className="space-y-1">
              {(result ?? preview)!.errors.map((e, i) => (
                <li key={i}>
                  File row {e.row + 1}, {e.path || 'family'}: {e.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
