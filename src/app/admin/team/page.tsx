// Team folded into People (DECISIONS #191): Signage.com admins are a filter there.
import { redirect } from 'next/navigation';

export default function TeamMoved() {
  redirect('/admin/people?type=team');
}
