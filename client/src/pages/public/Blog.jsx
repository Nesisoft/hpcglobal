import { useState, useCallback } from 'react';
import SEO from '../../components/ui/SEO';
import { Link } from 'react-router-dom';
import { BookOpen, Clock, ChevronRight, ChevronLeft } from 'lucide-react';
import { publicApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import SectionHero from '../../components/ui/SectionHero';

const CATEGORY_TABS = [
  { value: '',                label: 'All' },
  { value: 'DEVOTIONAL',      label: 'Devotional' },
  { value: 'PROPHETIC_WORD',  label: 'Prophetic Word' },
  { value: 'SERMON_NOTES',    label: 'Sermon Notes' },
  { value: 'TEACHING',        label: 'Teaching' },
  { value: 'TESTIMONY',       label: 'Testimony' },
  { value: 'EVENT_RECAP',     label: 'Event Recap' },
  { value: 'ANNOUNCEMENT',    label: 'Announcement' },
];

const CATEGORY_COLORS = {
  DEVOTIONAL:     'bg-purple-brand/10 text-purple-brand',
  PROPHETIC_WORD: 'bg-gold/10 text-gold',
  SERMON_NOTES:   'bg-blue-50 text-blue-600',
  TEACHING:       'bg-emerald-50 text-emerald-700',
  TESTIMONY:      'bg-pink-50 text-pink-600',
  EVENT_RECAP:    'bg-amber-50 text-amber-700',
  ANNOUNCEMENT:   'bg-slate-100 text-slate-600',
};

const CATEGORY_LABELS = {
  DEVOTIONAL:     'Devotional',
  PROPHETIC_WORD: 'Prophetic Word',
  SERMON_NOTES:   'Sermon Notes',
  TEACHING:       'Teaching',
  TESTIMONY:      'Testimony',
  EVENT_RECAP:    'Event Recap',
  ANNOUNCEMENT:   'Announcement',
};

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function PostCard({ post, featured }) {
  return (
    <Link
      to={`/blog/${post.slug}`}
      className={`group block bg-white rounded-xl border border-purple-brand/8 overflow-hidden hover:shadow-md transition-all duration-300 ${featured ? 'lg:flex' : ''}`}
    >
      <div className={`relative overflow-hidden bg-purple-brand/5 ${featured ? 'lg:w-5/12 flex-shrink-0 min-h-[220px]' : 'aspect-[16/9]'}`}>
        {post.featuredImage ? (
          <img
            src={post.featuredImage}
            alt={post.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-brand/10 to-purple-deep/20 flex items-center justify-center">
            <BookOpen size={featured ? 40 : 28} className="text-purple-brand/20" />
          </div>
        )}
        <div className="absolute top-3 left-3">
          <span className={`text-[10px] font-body font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[post.category] ?? 'bg-white/80 text-ink/60'}`}>
            {CATEGORY_LABELS[post.category] ?? post.category}
          </span>
        </div>
      </div>

      <div className={`p-5 flex flex-col ${featured ? 'lg:p-7 justify-center' : ''}`}>
        <div className="flex items-center gap-2 text-ink/40 text-[11px] font-body mb-2">
          {post.publishedAt && <span>{fmtDate(post.publishedAt)}</span>}
          {post.readTime && (
            <>
              <span>·</span>
              <span className="flex items-center gap-0.5"><Clock size={10} /> {post.readTime} min read</span>
            </>
          )}
          {post.author?.name && (
            <>
              <span>·</span>
              <span>{post.author.name}</span>
            </>
          )}
        </div>
        <h3 className={`font-display font-light text-ink mb-2 group-hover:text-purple-brand transition-colors ${featured ? 'text-2xl' : 'text-lg'}`}>
          {post.title}
        </h3>
        <p className={`text-ink/55 font-body leading-relaxed mb-4 ${featured ? 'text-sm line-clamp-3' : 'text-xs line-clamp-2'}`}>
          {post.excerpt}
        </p>
        <div className="flex items-center text-purple-brand text-xs font-body font-medium gap-1 group-hover:gap-2 transition-all mt-auto">
          Read More <ChevronRight size={13} />
        </div>
      </div>
    </Link>
  );
}

const PAGE_SIZE = 9;

export default function Blog() {
  const [category, setCategory] = useState('');
  const [page, setPage]         = useState(1);

  const fetchFn = useCallback(
    () => publicApi.getBlog({ category: category || undefined, page, limit: PAGE_SIZE }),
    [category, page],
  );
  const { data, loading } = useApi(fetchFn, [category, page]);

  const posts = data?.posts ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const featured = page === 1 && !category ? (posts.find((p) => p) ?? null) : null;
  const rest = featured ? posts.slice(1) : posts;

  function handleCategory(val) {
    setCategory(val);
    setPage(1);
  }

  return (
    <>
      <SEO title="Blog" description="Devotionals, prophetic words, sermon notes and testimonies from HPC Global. Daily spiritual nourishment for Kingdom living." />
      <SectionHero
        title="Blog"
        subtitle="Devotionals, prophetic words, teaching notes, and testimonies from our community."
        breadcrumb="Home / Blog"
      />

      {/* Category tabs */}
      <div className="sticky top-0 z-10 bg-white border-b border-purple-brand/8 shadow-sm">
        <div className="container-page">
          <div className="flex items-center gap-1 overflow-x-auto py-3">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => handleCategory(tab.value)}
                className={`px-4 py-1.5 rounded-full text-xs font-body font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                  category === tab.value
                    ? 'bg-purple-brand text-white'
                    : 'text-ink/55 hover:text-ink hover:bg-purple-brand/5'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="section-pad bg-cream">
        <div className="container-page">
          {loading ? (
            <div className="space-y-6">
              <div className="h-64 bg-white rounded-xl animate-pulse" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1,2,3,4,5,6].map((i) => <div key={i} className="h-56 bg-white rounded-xl animate-pulse" />)}
              </div>
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-20">
              <BookOpen size={48} className="text-purple-brand/20 mx-auto mb-4" />
              <h3 className="font-display text-2xl text-ink font-light mb-2">No posts yet</h3>
              <p className="text-ink/50 font-body text-sm">
                {category ? 'No posts in this category.' : 'Check back soon for new content.'}
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Featured */}
              {featured && (
                <div>
                  <p className="section-label mb-4">Featured</p>
                  <PostCard post={featured} featured />
                </div>
              )}

              {/* Grid */}
              {rest.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {rest.map((post) => <PostCard key={post.id} post={post} />)}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-4">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex items-center gap-1 text-xs font-body px-4 py-2 rounded border border-purple-brand/20 text-purple-brand hover:bg-purple-brand/5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={14} /> Previous
                  </button>
                  <span className="text-ink/50 text-xs font-body">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="flex items-center gap-1 text-xs font-body px-4 py-2 rounded border border-purple-brand/20 text-purple-brand hover:bg-purple-brand/5 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
