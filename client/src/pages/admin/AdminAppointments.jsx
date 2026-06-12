import { useState, useCallback } from 'react';
import { Plus, Trash2, CalendarClock, Clock, Check, X, CalendarCheck } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminModal from '../../components/admin/AdminModal';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import FormField from '../../components/admin/FormField';

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EMPTY_WINDOW = { dayOfWeek: 0, startTime: '09:00', endTime: '12:00', slotMinutes: 30 };
const STATUS_COLORS = {
  PENDING:   'bg-gold/10 text-gold',
  CONFIRMED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-red-50 text-red-600',
};
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export default function AdminAppointments() {
  const [modalOpen, setModalOpen]       = useState(false);
  const [form, setForm]                 = useState(EMPTY_WINDOW);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const availFn = useCallback(() => adminApi.getAvailability(), []);
  const { data: rawAvail = [], loading: availLoading, refetch: refetchAvail } = useApi(availFn);
  const availability = Array.isArray(rawAvail) ? rawAvail : [];

  const apptFn = useCallback(() => adminApi.getAppointments({ status: statusFilter || undefined }), [statusFilter]);
  const { data: apptData, loading: apptLoading, refetch: refetchAppts } = useApi(apptFn, [statusFilter]);
  const appointments = apptData?.appointments ?? [];

  async function handleSaveWindow() {
    if (form.startTime >= form.endTime) { setError('End time must be after start time.'); return; }
    setSaving(true);
    setError('');
    try {
      await adminApi.createAvailability({
        dayOfWeek:   Number(form.dayOfWeek),
        startTime:   form.startTime,
        endTime:     form.endTime,
        slotMinutes: Number(form.slotMinutes),
      });
      setModalOpen(false);
      refetchAvail();
    } catch (e) {
      setError(e.response?.data?.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteWindow() {
    setDeleting(true);
    try {
      await adminApi.deleteAvailability(deleteTarget.id);
      setDeleteTarget(null);
      refetchAvail();
    } catch { setDeleting(false); }
  }

  async function setStatus(appt, status) {
    try {
      await adminApi.updateAppointment(appt.id, { status });
      refetchAppts();
    } catch {
      alert('Could not update status. Please try again.');
    }
  }

  return (
    <AdminLayout title="Appointments">
      <AdminPageHeader
        title="Appointments"
        subtitle="Manage availability and bookings with the Prophet"
        action={{ label: 'Add Availability', icon: Plus, onClick: () => { setForm(EMPTY_WINDOW); setError(''); setModalOpen(true); } }}
      />

      {/* Weekly availability */}
      <div className="bg-white rounded-xl border border-purple-brand/8 p-5 mb-6">
        <h3 className="font-display text-base text-ink font-light mb-4 flex items-center gap-2">
          <CalendarClock size={16} className="text-gold" /> Weekly Availability
        </h3>
        {availLoading ? (
          <div className="h-16 animate-pulse bg-purple-brand/5 rounded-lg" />
        ) : availability.length === 0 ? (
          <p className="text-ink/40 font-body text-sm">No availability set. Add weekly windows so people can book.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {availability.map((w) => (
              <div key={w.id} className="flex items-center gap-2 bg-purple-brand/5 border border-purple-brand/10 rounded-lg px-3 py-2 text-sm font-body">
                <span className="font-medium text-ink/80">{DAY_LABELS[w.dayOfWeek]}</span>
                <span className="text-ink/55 flex items-center gap-1"><Clock size={11} /> {w.startTime}–{w.endTime}</span>
                <span className="text-ink/35 text-xs">{w.slotMinutes}m slots</span>
                <button onClick={() => setDeleteTarget(w)} className="text-ink/30 hover:text-red-500 ml-1" title="Remove">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bookings */}
      <div className="flex items-center gap-2 mb-4">
        <select className="input py-2 text-sm w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {apptLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-white rounded-xl border border-purple-brand/8 h-20 animate-pulse" />)}</div>
      ) : appointments.length === 0 ? (
        <div className="bg-white rounded-xl border border-purple-brand/8 py-16 text-center">
          <CalendarCheck size={32} className="mx-auto mb-3 text-ink/20" />
          <p className="text-ink/35 font-body text-sm">No appointments yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {appointments.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border border-purple-brand/8 flex flex-wrap items-center gap-4 px-5 py-4">
              <div className="flex-1 min-w-[180px]">
                <p className="font-medium text-ink/90 text-sm">{a.name}</p>
                <p className="text-ink/45 text-xs font-body">{a.email} · {a.phone}</p>
              </div>
              <div className="min-w-[160px]">
                <p className="text-ink/80 text-sm font-body flex items-center gap-1.5"><CalendarCheck size={12} className="text-gold" /> {fmtDate(a.date)}</p>
                <p className="text-ink/45 text-xs font-body flex items-center gap-1.5"><Clock size={11} /> {a.time} GMT</p>
              </div>
              <div className="min-w-[160px]">
                <p className="text-ink/70 text-xs font-body"><span className="text-ink/40">Reason:</span> {a.reason}</p>
                {a.notes && <p className="text-ink/45 text-xs font-body mt-0.5 line-clamp-2">{a.notes}</p>}
              </div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[a.status] ?? ''}`}>{a.status}</span>
              <div className="flex items-center gap-1.5">
                {a.status !== 'CONFIRMED' && (
                  <button onClick={() => setStatus(a, 'CONFIRMED')} className="text-xs px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 font-body flex items-center gap-1">
                    <Check size={12} /> Confirm
                  </button>
                )}
                {a.status !== 'CANCELLED' && (
                  <button onClick={() => setStatus(a, 'CANCELLED')} className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-body flex items-center gap-1">
                    <X size={12} /> Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AdminModal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Weekly Availability" size="md">
        <div className="space-y-4">
          <FormField label="Day of Week" required>
            <select className="input" value={form.dayOfWeek} onChange={(e) => setForm((f) => ({ ...f, dayOfWeek: e.target.value }))}>
              {DAY_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Time (GMT)" required>
              <input type="time" className="input" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} />
            </FormField>
            <FormField label="End Time (GMT)" required>
              <input type="time" className="input" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Slot Length (minutes)" required hint="Each booking occupies one slot">
            <input type="number" min="5" step="5" className="input" value={form.slotMinutes} onChange={(e) => setForm((f) => ({ ...f, slotMinutes: e.target.value }))} />
          </FormField>
        </div>
        {error && <p className="text-red-500 text-xs font-body mt-3">{error}</p>}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-purple-brand/8">
          <button onClick={() => setModalOpen(false)} className="btn-outline text-sm px-5 py-2"><X size={14} /> Cancel</button>
          <button onClick={handleSaveWindow} disabled={saving} className="btn-primary text-sm px-5 py-2 disabled:opacity-50">
            {saving ? 'Saving…' : <><Check size={14} /> Add Window</>}
          </button>
        </div>
      </AdminModal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteWindow}
        loading={deleting}
        title="Remove Availability"
        message={deleteTarget ? `${DAY_LABELS[deleteTarget.dayOfWeek]} ${deleteTarget.startTime}–${deleteTarget.endTime} will be removed.` : ''}
      />
    </AdminLayout>
  );
}
