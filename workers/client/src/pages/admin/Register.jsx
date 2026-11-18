import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import AppShell from '../../components/AppShell';
import { PageHeader } from '../../components/ui';
import { Register } from '../../components/register';
import { api, qs } from '../../lib/api';

/** One date's register across the church, where the office puts attendance right. */
export default function AdminRegister() {
  const { sessionId } = useParams();
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState('');
  useEffect(() => {
    api.get('/admin/departments').then((res) => setDepartments(res.departments)).catch(() => {});
  }, []);

  return (
    <AppShell title="Register">
      <Link to="/admin/sessions" className="btn-ghost px-0 text-sm mb-3 print:hidden"><ArrowLeft size={15} /> Sessions</Link>
      <PageHeader title="Register" subtitle="Everyone active, by whether they came. Mark someone present or remove a record — with a reason, kept in the audit log.">
        <select aria-label="Department" className="input py-2 w-auto print:hidden" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </PageHeader>
      <Register
        url={`/admin/sessions/${sessionId}/register${qs({ departmentId })}`}
        markUrl={`/admin/sessions/${sessionId}/attendance`}
        removeUrl={(a) => `/admin/attendance/${a.id}/remove`}
        canRemove={() => true}
        showDepartment={!departmentId}
      />
    </AppShell>
  );
}
