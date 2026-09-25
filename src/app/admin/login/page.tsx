// The console's old sign-in address. Since SPEC v2.3 every account signs in at
// /sign-in; this keeps bookmarks and old links working.

import { redirect } from 'next/navigation';

export default function AdminLogin() {
  redirect('/sign-in?next=/admin');
}
