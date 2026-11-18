import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { PageHeader } from '../../components/ui';
import { TicketDesk } from '../../components/tickets';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { accraToday, addDays } from '../../lib/format';

/** Every ticket in the church: issue, resolve, filter by department. */
export default function AdminTickets() {
  const { worker } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState('');
  const [people, setPeople] = useState(null);
  const [sessions, setSessions] = useState([]);
  useEffect(() => {
    api.get('/admin/departments').then((r) => setDepartments(r.departments)).catch(() => {});
    api.get('/admin/workers?status=ACTIVE&limit=100').then((r) => setPeople(r.workers)).catch(() => setPeople([]));
    const today = accraToday();
    api.get(`/admin/sessions?from=${addDays(today, -28)}&to=${today}`)
      .then((r) => setSessions(r.sessions.filter((s) => !s.cancelled && new Date(s.startsAt) <= new Date()).reverse()))
      .catch(() => {});
  }, []);

  return (
    <AppShell title="Tickets">
      <PageHeader title="Tickets" subtitle="Penalty tickets for lateness, absence or conduct. The worker sees each one, and how it was resolved.">
        <select aria-label="Department" className="input py-2 w-auto" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </PageHeader>
      <TicketDesk base="/admin" selfId={worker.id} people={people} sessions={sessions} query={departmentId ? `departmentId=${departmentId}` : ''} />
    </AppShell>
  );
}
