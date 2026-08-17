// One approved brand item, as a franchisee sees it when choosing.
//
// Shared by the add-signs screen and step 3 of initial setup, because they are
// the same decision made at two moments. Every card states the three things that
// change what happens next: the locked spec, who fulfils it (SPEC §4), and
// whether there is a price or a custom quote (SPEC §2.1).

import { SignThumbnail } from '@/components/SignThumbnail';
import { formatPrice, VendorChip } from '@/components/StatusChip';
import type { BrandItemRow, BrandPublic } from '@/lib/db/queries';

export function CatalogCard({
  item,
  brand,
  selected,
  installed,
  onToggle,
  children,
}: {
  item: BrandItemRow;
  brand: BrandPublic;
  selected: boolean;
  /** Already on the location's record — worth saying, never a block. */
  installed?: boolean;
  onToggle: () => void;
  /** Site-detail fields, revealed once the item is selected. */
  children?: React.ReactNode;
}) {
  const policy = item.vendor_policy_override ?? brand.vendor_policy;

  return (
    <div
      className={`rounded-xl border bg-white p-3 ${selected ? '' : 'border-gray-200'}`}
      style={
        selected
          ? { borderColor: 'var(--color-brand)', boxShadow: '0 0 0 1px var(--color-brand)' }
          : undefined
      }
    >
      <SignThumbnail
        renderKey={item.render_key}
        label={item.name}
        className="mb-2 h-20 w-full rounded-lg border border-gray-100"
      />

      <p className="text-sm font-medium text-gray-900">{item.name}</p>
      {item.spec_summary && (
        <p className="mt-0.5 text-[11px] leading-snug text-gray-500">{item.spec_summary}</p>
      )}
      <p className="mt-1 text-xs font-medium text-gray-900">{formatPrice(item.est_price)}</p>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
        <button
          type="button"
          onClick={onToggle}
          className="text-[11px] font-medium"
          style={{ color: selected ? '#6B7280' : 'var(--color-brand)' }}
        >
          {selected ? '× Remove' : '+ Add · needs approval'}
        </button>
        <span className="flex items-center gap-1">
          {installed && <span className="text-[9px] text-gray-400">installed</span>}
          <VendorChip policy={policy} vendorName={brand.vendor_name} />
        </span>
      </div>

      {selected && children && <div className="mt-2 border-t border-gray-100 pt-2">{children}</div>}
    </div>
  );
}
