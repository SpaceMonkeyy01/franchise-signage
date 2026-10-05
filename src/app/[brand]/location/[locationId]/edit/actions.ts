'use server';

// Saving a store's details (DECISIONS #177). Reachable by direct POST, so it
// checks the caller itself: the owner of the store's company, or Signage.com.

import { revalidatePath } from 'next/cache';

import { checkStoreOrdering } from '@/lib/auth/stores';
import type { SubmitFailure } from '@/lib/forms';
import type { StoreFields } from '@/lib/stores/changes';
import { StoreEditError, getEditableStore, updateStore } from '@/lib/stores/edit';

export async function updateStoreAction(
  brandSlug: string,
  locationId: string,
  fields: StoreFields,
): Promise<SubmitFailure | { saved: number }> {
  const access = await checkStoreOrdering(brandSlug, locationId);
  if ('error' in access) return { error: access.error };
  if (access.scope.kind === 'none' || !access.scope.canCreateStore) {
    return { error: 'Only the owner of this store can change its details.' };
  }
  const store = await getEditableStore(locationId);
  if (!store) return { error: 'That store no longer exists.' };

  try {
    const saved = await updateStore(
      {
        profileId: access.viewer.profile.id,
        label: access.viewer.profile.name ?? access.viewer.profile.email,
        isTeam: access.scope.kind === 'all',
      },
      store,
      fields,
    );
    revalidatePath(`/${brandSlug}`);
    revalidatePath(`/${brandSlug}/location/${locationId}/edit`);
    return { saved };
  } catch (error) {
    if (error instanceof StoreEditError) return { error: error.message };
    throw error;
  }
}
