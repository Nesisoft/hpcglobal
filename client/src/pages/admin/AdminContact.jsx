import { useState, useCallback } from 'react';
import { Mail, MailOpen, Phone, X } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminTable from '../../components/admin/AdminTable';
import AdminModal from '../../components/admin/AdminModal';

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (d) =>
  new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export default function AdminContact() {
  const [selected, setSelected] = useState(null);

  const fetchFn = useCallback(() => adminApi.getMessages(), []);
  const { data, loading, refetch } = useApi(fetchFn);
  const messages = data?.messages ?? [];
  const total    = data?.total    ?? 0;
  const unread   = messages.filter((m) => !m.isRead).length;

  async function openMessage(row) {
    setSelected(row);
    if (!row.isRead) {
      await adminApi.readMessage(row.id).catch(() => {});
      refetch();
    }
  }

  const columns = [
    {
      key: 'name',
      label: 'From',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${row.isRead ? 'bg-transparent' : 'bg-purple-brand'}`} />
          <div className="min-w-0">
            <p className={`text-sm leading-tight truncate ${row.isRead ? 'text-ink/70' : 'font-semibold text-ink'}`}>
              {row.name}
            </p>
            <p className="text-ink/40 text-[11px] truncate">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      render: (row) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-brand/10 text-purple-brand">
          {row.type}
        </span>
      ),
    },
    {
      key: 'message',
      label: 'Message',
      render: (row) => (
        <p className={`text-sm line-clamp-1 max-w-sm ${row.isRead ? 'text-ink/55' : 'text-ink/80'}`}>
          {row.message}
        </p>
      ),
    },
    {
      key: 'createdAt',
      label: 'Received',
      render: (row) => (
        <div>
          <p className="text-ink/60 text-xs">{fmtDate(row.createdAt)}</p>
          <p className="text-ink/35 text-[11px]">{fmtTime(row.createdAt)}</p>
        </div>
      ),
    },
  ];

  return (
    <AdminLayout title="Messages">
      <AdminPageHeader
        title="Contact Messages"
        subtitle={`${total} message${total !== 1 ? 's' : ''}${unread > 0 ? ` · ${unread} unread` : ''}`}
      />

      <AdminTable
        columns={columns}
        rows={messages}
        loading={loading}
        empty="No contact messages yet."
        onRow={openMessage}
      />

      <AdminModal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Message"
        size="lg"
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 pb-4 border-b border-purple-brand/8">
              <div className="w-11 h-11 rounded-full bg-purple-brand/10 flex items-center justify-center text-purple-brand flex-shrink-0">
                {selected.isRead ? <MailOpen size={18} /> : <Mail size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg text-ink font-light">{selected.name}</p>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  <a href={`mailto:${selected.email}`} className="text-purple-brand text-xs hover:underline">
                    {selected.email}
                  </a>
                  {selected.phone && (
                    <span className="flex items-center gap-1 text-ink/50 text-xs">
                      <Phone size={10} /> {selected.phone}
                    </span>
                  )}
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-brand/10 text-purple-brand">
                    {selected.type}
                  </span>
                </div>
                <p className="text-ink/35 text-[11px] mt-1">{fmtDate(selected.createdAt)} at {fmtTime(selected.createdAt)}</p>
              </div>
            </div>

            <div className="rounded-lg bg-cream/40 border border-purple-brand/8 p-5 text-ink/80 font-body text-sm leading-relaxed whitespace-pre-wrap">
              {selected.message}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-purple-brand/8">
              <a
                href={`mailto:${selected.email}?subject=Re: ${selected.type}`}
                className="btn-primary text-sm px-5 py-2"
              >
                <Mail size={14} /> Reply by email
              </a>
              <button onClick={() => setSelected(null)} className="btn-outline text-sm px-5 py-2">
                <X size={14} /> Close
              </button>
            </div>
          </div>
        )}
      </AdminModal>
    </AdminLayout>
  );
}
