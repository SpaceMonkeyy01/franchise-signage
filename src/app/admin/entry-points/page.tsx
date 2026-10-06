// Entry points became the Walkthrough's Links view (DECISIONS #191).
import { redirect } from 'next/navigation';

export default function EntryPointsMoved() {
  redirect('/admin/demo?view=links');
}
