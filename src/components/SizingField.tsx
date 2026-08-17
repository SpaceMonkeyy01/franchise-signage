// The site-detail field, with its TBD escape hatch.
//
// TBD is a first-class answer (SPEC §5.4): a franchisee who does not yet know
// the frontage is exactly who this program is for, and making them guess puts a
// wrong number into a quote. Marking it TBD flags team follow-up and never
// blocks the submission — the status page repeats that promise afterwards.

export function SizingField({
  siteVariables,
  value,
  tbd,
  onValueChange,
  onTbdChange,
  placeholder = 'Sizing / site notes',
}: {
  /** Which attributes stay per-site for this brand item, e.g. ["size"]. */
  siteVariables?: string[];
  value: string;
  tbd: boolean;
  onValueChange: (value: string) => void;
  onTbdChange: (tbd: boolean) => void;
  placeholder?: string;
}) {
  return (
    <div>
      {siteVariables && siteVariables.length > 0 && (
        <p className="mb-1 text-[10px] text-gray-400">
          Site details — {siteVariables.join(', ').replace(/_/g, ' ')}
        </p>
      )}
      <div className="flex items-center gap-2">
        <input
          value={tbd ? '' : value}
          disabled={tbd}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={tbd ? 'The team will follow up' : placeholder}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          type="button"
          onClick={() => onTbdChange(!tbd)}
          aria-pressed={tbd}
          className={`whitespace-nowrap rounded-lg border px-2 py-1.5 text-[11px] ${
            tbd ? 'font-medium' : 'border-gray-200 text-gray-400 hover:border-gray-300'
          }`}
          style={
            tbd
              ? {
                  color: 'var(--color-brand-dark)',
                  borderColor: 'var(--color-brand)',
                  background: 'var(--color-brand-light)',
                }
              : undefined
          }
        >
          Not sure / TBD
        </button>
      </div>
    </div>
  );
}
