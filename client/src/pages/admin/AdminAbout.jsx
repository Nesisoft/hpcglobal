import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, Heart, BookOpen, Award } from 'lucide-react';
import { adminApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import AdminLayout from '../../components/admin/AdminLayout';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import FormField from '../../components/admin/FormField';

function safeParse(json, fallback) {
  if (Array.isArray(json)) return json;
  if (!json) return fallback;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

const EMPTY_VALUE     = { title: '', description: '' };
const EMPTY_BELIEF    = { title: '', description: '' };
const EMPTY_MILESTONE = { year: '', title: '', description: '' };

function ListEditor({ icon: Icon, title, items, setItems, fields, addLabel, emptyItem }) {
  return (
    <div className="bg-white rounded-xl border border-purple-brand/8 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-purple-brand" />
          <h3 className="font-display text-base text-ink font-light">{title}</h3>
          <span className="text-ink/40 text-xs">({items.length})</span>
        </div>
        <button
          onClick={() => setItems([...items, { ...emptyItem }])}
          className="flex items-center gap-1 text-xs text-purple-brand hover:bg-purple-brand/5 px-2 py-1 rounded transition-colors"
        >
          <Plus size={12} /> {addLabel}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-ink/35 font-body text-xs text-center py-4">None added yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className="rounded-lg border border-purple-brand/8 bg-cream/20 p-3 relative">
              <button
                onClick={() => setItems(items.filter((_, i) => i !== idx))}
                className="absolute top-2 right-2 text-ink/30 hover:text-red-500 p-1 rounded transition-colors"
                title="Remove"
              >
                <Trash2 size={12} />
              </button>
              <div className={`grid grid-cols-1 ${fields.length > 2 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-3 pr-6`}>
                {fields.map((f) => (
                  <div key={f.key} className={f.full ? 'sm:col-span-full' : ''}>
                    <FormField label={f.label}>
                      {f.textarea ? (
                        <textarea
                          className="input min-h-[55px] resize-y text-sm"
                          value={item[f.key] ?? ''}
                          onChange={(e) => {
                            const next = [...items];
                            next[idx] = { ...next[idx], [f.key]: e.target.value };
                            setItems(next);
                          }}
                        />
                      ) : (
                        <input
                          className="input text-sm"
                          placeholder={f.placeholder}
                          value={item[f.key] ?? ''}
                          onChange={(e) => {
                            const next = [...items];
                            next[idx] = { ...next[idx], [f.key]: e.target.value };
                            setItems(next);
                          }}
                        />
                      )}
                    </FormField>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminAbout() {
  const fetchFn = useCallback(() => adminApi.getAbout(), []);
  const { data, loading, refetch } = useApi(fetchFn);

  const [vision, setVision]           = useState('');
  const [mission, setMission]         = useState('');
  const [story, setStory]             = useState('');
  const [foundedYear, setFoundedYear] = useState('');
  const [coreValues, setCoreValues]   = useState([]);
  const [beliefs, setBeliefs]         = useState([]);
  const [milestones, setMilestones]   = useState([]);
  const [saving, setSaving]           = useState(false);
  const [status, setStatus]           = useState('');

  useEffect(() => {
    if (!data) return;
    setVision(data.vision ?? '');
    setMission(data.mission ?? '');
    setStory(data.story ?? '');
    setFoundedYear(data.foundedYear ?? '');
    setCoreValues(safeParse(data.coreValues, []));
    setBeliefs(safeParse(data.beliefs, []));
    setMilestones(safeParse(data.milestones, []));
  }, [data]);

  async function handleSave() {
    setSaving(true);
    setStatus('');
    try {
      await adminApi.updateAbout({
        vision,
        mission,
        story,
        foundedYear: foundedYear ? Number(foundedYear) : null,
        coreValues:  JSON.stringify(coreValues),
        beliefs:     JSON.stringify(beliefs),
        milestones:  JSON.stringify(milestones),
      });
      setStatus('Saved successfully.');
      refetch();
      setTimeout(() => setStatus(''), 2500);
    } catch (e) {
      setStatus(e.response?.data?.message ?? 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout title="About">
      <AdminPageHeader
        title="About Page"
        subtitle="The vision, mission, story, beliefs, and milestones shown on the public About page."
        action={{
          label: saving ? 'Saving…' : 'Save Changes',
          icon: Save,
          onClick: handleSave,
        }}
      />

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-purple-brand/8 h-32 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Core text fields */}
          <div className="bg-white rounded-xl border border-purple-brand/8 p-5 space-y-4">
            <h3 className="font-display text-base text-ink font-light">Foundation</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Vision Statement">
                <textarea
                  className="input min-h-[80px] resize-y"
                  value={vision}
                  onChange={(e) => setVision(e.target.value)}
                />
              </FormField>
              <FormField label="Mission Statement">
                <textarea
                  className="input min-h-[80px] resize-y"
                  value={mission}
                  onChange={(e) => setMission(e.target.value)}
                />
              </FormField>
            </div>
            <FormField label="Our Story" hint="The narrative shown on the About page">
              <textarea
                className="input min-h-[140px] resize-y"
                value={story}
                onChange={(e) => setStory(e.target.value)}
              />
            </FormField>
            <FormField label="Founded Year" hint="e.g. 2008">
              <input
                type="number"
                className="input max-w-[160px]"
                value={foundedYear}
                onChange={(e) => setFoundedYear(e.target.value)}
              />
            </FormField>
          </div>

          <ListEditor
            icon={Heart}
            title="Core Values"
            items={coreValues}
            setItems={setCoreValues}
            addLabel="Add Value"
            emptyItem={EMPTY_VALUE}
            fields={[
              { key: 'title',       label: 'Title',       placeholder: 'Worship'           },
              { key: 'description', label: 'Description', placeholder: 'Short summary', textarea: true, full: true },
            ]}
          />

          <ListEditor
            icon={BookOpen}
            title="What We Believe"
            items={beliefs}
            setItems={setBeliefs}
            addLabel="Add Belief"
            emptyItem={EMPTY_BELIEF}
            fields={[
              { key: 'title',       label: 'Heading', placeholder: 'The Bible'  },
              { key: 'description', label: 'Detail',  placeholder: 'What we hold to be true', textarea: true, full: true },
            ]}
          />

          <ListEditor
            icon={Award}
            title="Milestones"
            items={milestones}
            setItems={setMilestones}
            addLabel="Add Milestone"
            emptyItem={EMPTY_MILESTONE}
            fields={[
              { key: 'year',        label: 'Year',        placeholder: '2015'        },
              { key: 'title',       label: 'Title',       placeholder: 'Church planted' },
              { key: 'description', label: 'Description', placeholder: 'What happened', textarea: true, full: true },
            ]}
          />

          {status && (
            <div className="bg-white rounded-xl border border-purple-brand/8 px-4 py-3 text-sm text-purple-brand font-body">
              {status}
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
