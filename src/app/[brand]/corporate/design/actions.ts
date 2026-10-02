'use server';

// The brand admin's Design Studio (SPEC v2.6 §8): a logo, a priced preview,
// and saving a sign's design with what franchisees may change. The brand
// comes from the caller's access, never the browser; prices come from the
// server — Signize's cost never leaves it.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { revalidatePath } from 'next/cache';

import { checkCorporate } from '@/lib/auth/corporate';
import type { SignDesign } from '@/lib/designs/design';
import { StudioError, getDesignableSign, quoteDesign, saveBrandDesign, storeLogo } from '@/lib/designs/studio';
import { putUpload } from '@/lib/storage';

type Failure = { error: string };

async function access(brandSlug: string) {
  const checked = await checkCorporate(brandSlug, { manage: true });
  return 'error' in checked ? { error: checked.error } : checked;
}

function fail(error: unknown): Failure {
  if (error instanceof StudioError || error instanceof RangeError) return { error: error.message };
  console.error('design studio action failed', error);
  return { error: 'That did not work. Try again.' };
}

export async function uploadLogoAction(
  brandSlug: string,
  formData: FormData,
): Promise<{ logo: SignDesign['logo'] } | Failure> {
  const checked = await access(brandSlug);
  if ('error' in checked) return checked;
  try {
    return { logo: await storeLogo(formData, brandSlug) };
  } catch (error) {
    return fail(error);
  }
}

/** Start from the logo the brand already has on file (brands.logo_url, under public/). */
export async function brandLogoAction(brandSlug: string): Promise<{ logo: SignDesign['logo'] } | Failure> {
  const checked = await access(brandSlug);
  if ('error' in checked) return checked;
  const url = checked.brand.logo_url;
  if (!url || !url.startsWith('/') || url.includes('..')) return { error: 'This brand has no logo on file. Upload one.' };
  try {
    const bytes = await readFile(join(process.cwd(), 'public', url));
    const type = url.endsWith('.png') ? 'image/png' : url.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    const stored = await putUpload(new File([new Uint8Array(bytes)], url.split('/').pop() ?? 'logo', { type }), `${brandSlug}/logos`);
    return { logo: { path: stored.storagePath, fileName: stored.fileName, contentType: stored.contentType } };
  } catch (error) {
    return fail(error);
  }
}

export async function previewDesignAction(
  brandSlug: string,
  itemId: string,
  design: SignDesign,
): Promise<{ design: SignDesign } | Failure> {
  const checked = await access(brandSlug);
  if ('error' in checked) return checked;
  const sign = await getDesignableSign(itemId, checked.brand.id);
  if (!sign) return { error: 'That sign is not in your catalog.' };
  try {
    return { design: await quoteDesign(sign, design) };
  } catch (error) {
    return fail(error);
  }
}

export async function saveDesignAction(
  brandSlug: string,
  itemId: string,
  design: SignDesign,
  rules: unknown,
): Promise<{ design: SignDesign } | Failure> {
  const checked = await access(brandSlug);
  if ('error' in checked) return checked;
  const sign = await getDesignableSign(itemId, checked.brand.id);
  if (!sign) return { error: 'That sign is not in your catalog.' };
  try {
    const saved = await saveBrandDesign(
      sign,
      {
        membershipId: checked.membership.id,
        label: checked.viewer.profile.name ?? checked.viewer.profile.email,
      },
      design,
      rules,
    );
    revalidatePath(`/${brandSlug}/corporate`, 'page');
    revalidatePath(`/${brandSlug}/corporate/design/${itemId}`);
    return { design: saved };
  } catch (error) {
    return fail(error);
  }
}
