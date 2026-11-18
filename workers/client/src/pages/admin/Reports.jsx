import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { PageHeader } from '../../components/ui';
import { ReportView, RollupTable } from '../../components/report';
import { api } from '../../lib/api';

/** Church-wide attendance: by department, by service and by worker. */
export default function Reports() {
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState('');
  useEffect(() => {
    api.get('/admin/departments').then((res) => setDepartments(res.departments)).catch(() => {});
  }, []);
  const chosen = departments.find((d) => d.id === departmentId);

  return (
    <AppShell title="Reports">
      <PageHeader title="Reports" subtitle="Who came, who was excused and who was absent — for services that count towards attendance.">
        <select aria-label="Department" className="input py-2 w-auto print:hidden" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}{d.active ? '' : ' (archived)'}</option>)}
        </select>
      </PageHeader>
      <ReportView
        url="/admin/report"
        csvUrl="/admin/report.csv"
        filters={{ departmentId }}
        showDepartment={!departmentId}
        printTitle={chosen ? `${chosen.name} — attendance` : 'HPC Global workers — attendance'}
        csvViews={[
          { view: 'workers', label: 'Workers CSV' },
          ...(departmentId ? [] : [{ view: 'departments', label: 'Departments CSV' }]),
          { view: 'services', label: 'Services CSV' },
        ]}
        extra={(report) => (
          <div className="grid 2xl:grid-cols-2 gap-4 sm:gap-5 items-start">
            {!departmentId && (
              <RollupTable title="By department" nameLabel="Department" rows={report.departments}
                extraColumn={{ label: 'Workers', value: (r) => r.workers }} />
            )}
            <RollupTable title="By service" nameLabel="Service" rows={report.services}
              extraColumn={{ label: 'Dates', value: (r) => r.sessions }} />
          </div>
        )}
      />
    </AppShell>
  );
}
