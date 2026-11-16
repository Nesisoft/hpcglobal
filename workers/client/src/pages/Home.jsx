import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, UserCheck, UserCog, ChevronRight, CalendarCheck } from 'lucide-react';
import AppShell from '../components/AppShell';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { greeting } from '../lib/format';

export default function Home() {
  const { worker, isHod, isAdmin } = useAuth();
  const [waiting, setWaiting] = useState({ department: null, all: null });

  // People waiting for this person to approve them.
  useEffect(() => {
    if (isHod) api.get('/hod/members?status=PENDING').then((r) => setWaiting((w) => ({ ...w, department: r.counts.PENDING }))).catch(() => {});
    if (isAdmin) api.get('/admin/workers?status=PENDING&limit=1').then((r) => setWaiting((w) => ({ ...w, all: r.counts.PENDING }))).catch(() => {});
  }, [isHod, isAdmin]);

  return (
    <AppShell title="Home">
      {/* Welcome — the website's hero colours */}
      <section className="rounded-2xl bg-purple-deep text-white p-6 sm:p-8 mb-6 relative overflow-hidden"
        style={{ backgroundImage: 'radial-gradient(circle at 85% 20%, rgba(90,45,175,0.55), transparent 55%), radial-gradient(circle at 10% 100%, rgba(201,168,76,0.14), transparent 45%)' }}>
        <p className="section-label">{greeting()}</p>
        <h1 className="font-display text-3xl sm:text-4xl font-light mt-1">{worker.firstName}</h1>
        <p className="text-white/55 font-body text-sm mt-1">
          {worker.department ? `${isHod ? 'Head of ' : ''}${worker.department.name}` : 'HPC Global'}
        </p>
      </section>

      {/* Clocking in arrives with the services */}
      <section className="card p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-gold/10 ring-1 ring-gold/20 flex items-center justify-center flex-shrink-0">
            <Clock size={22} className="text-gold" />
          </div>
          <div>
            <h2 className="font-display text-2xl text-ink">Clocking in</h2>
            <p className="text-ink/55 font-body text-sm mt-1">
              The church office is setting up the service times. Once they’re in, this is where you clock in
              and out of each service.
            </p>
          </div>
        </div>
      </section>

      {(isHod || isAdmin) && (
        <section className="grid sm:grid-cols-2 gap-4">
          {isHod && (
            <ActionCard to="/department" icon={UserCheck}
              title={`${worker.department.name} members`}
              text={waiting.department ? `${waiting.department} waiting for your approval` : 'Approve new members of your department'}
              highlight={Boolean(waiting.department)} />
          )}
          {isAdmin && (
            <ActionCard to="/admin/workers?status=PENDING" icon={UserCog}
              title="Workers"
              text={waiting.all ? `${waiting.all} sign-ups waiting across all departments` : 'Approve sign-ups and manage accounts'}
              highlight={Boolean(waiting.all)} />
          )}
        </section>
      )}

      {!isHod && !isAdmin && (
        <section className="card p-6 flex items-center gap-4">
          <CalendarCheck size={20} className="text-purple-brand flex-shrink-0" />
          <p className="text-ink/60 font-body text-sm">Your attendance history will appear here once you start clocking in.</p>
        </section>
      )}
    </AppShell>
  );
}

function ActionCard({ to, icon: Icon, title, text, highlight }) {
  return (
    <Link to={to} className="card p-5 flex items-center gap-4 hover:shadow-md transition-shadow group">
      <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ring-1 ${
        highlight ? 'bg-gold/15 ring-gold/30' : 'bg-purple-brand/8 ring-purple-brand/15'}`}>
        <Icon size={20} className={highlight ? 'text-gold' : 'text-purple-brand'} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-body font-semibold text-ink text-sm">{title}</p>
        <p className={`font-body text-sm ${highlight ? 'text-[#8a6d1f]' : 'text-ink/50'}`}>{text}</p>
      </div>
      <ChevronRight size={18} className="text-ink/25 group-hover:text-ink/50" />
    </Link>
  );
}
