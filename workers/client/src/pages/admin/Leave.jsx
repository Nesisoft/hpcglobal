import AppShell from '../../components/AppShell';
import { PageHeader } from '../../components/ui';
import { LeaveReview } from '../../components/leave';
import { useAuth } from '../../lib/auth';

/** Every leave request in the church — heads of department review their own members'; the office sees all and reviews the HODs'. */
export default function AdminLeave() {
  const { worker } = useAuth();
  return (
    <AppShell title="Leave">
      <PageHeader title="Leave" subtitle="Requests to be excused. Approved leave counts as excused, not absent, in every report." />
      <LeaveReview base="/admin" selfId={worker.id} />
    </AppShell>
  );
}
