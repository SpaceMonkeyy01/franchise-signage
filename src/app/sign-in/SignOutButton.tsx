import { signOut } from './actions';

/** A form, not a link: signing out changes state, so it is a POST. */
export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className={
          className ??
          'w-full rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50'
        }
      >
        Sign out
      </button>
    </form>
  );
}
