import { useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, Clock, Calendar, BookOpen, ArrowLeft, Send } from 'lucide-react';
import { publicApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';

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
  DEVOTIONAL:'Devotional', PROPHETIC_WORD:'Prophetic Word', SERMON_NOTES:'Sermon Notes',
  TEACHING:'Teaching', TESTIMONY:'Testimony', EVENT_RECAP:'Event Recap', ANNOUNCEMENT:'Announcement',
};

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function BlogPost() {
  const { slug } = useParams();
  const fetchFn = useCallback(() => publicApi.getBlogPost(slug), [slug]);
  const { data: post, loading, error } = useApi(fetchFn);

  if (loading) {
    return (
      <div className="min-h-screen bg-cream pt-32">
        <div className="container-page max-w-3xl mx-auto space-y-6">
          <div className="h-8 w-32 bg-purple-brand/10 rounded animate-pulse" />
          <div className="h-12 bg-purple-brand/10 rounded animate-pulse" />
          <div className="h-64 bg-white rounded-xl animate-pulse" />
          <div className="space-y-3">
            {[1,2,3,4].map((i) => <div key={i} className="h-4 bg-purple-brand/5 rounded animate-pulse" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <BookOpen size={48} className="text-purple-brand/20 mx-auto mb-4" />
          <h2 className="font-display text-2xl text-ink font-light mb-2">Post not found</h2>
          <p className="text-ink/50 font-body text-sm mb-6">This post may have been removed or the link is incorrect.</p>
          <Link to="/blog" className="btn-primary"><ArrowLeft size={14} /> Back to Blog</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Hero image */}
      {post.featuredImage ? (
        <div className="h-64 sm:h-80 lg:h-96 relative overflow-hidden bg-purple-deep">
          <img src={post.featuredImage} alt={post.title} className="w-full h-full object-cover opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-t from-purple-deep/80 to-transparent" />
        </div>
      ) : (
        <div className="h-40 bg-purple-deep" />
      )}

      <div className="container-page max-w-3xl mx-auto px-4">
        {/* Back link */}
        <div className="pt-8 pb-6">
          <Link to="/blog" className="inline-flex items-center gap-1 text-ink/40 hover:text-purple-brand text-xs font-body transition-colors">
            <ChevronLeft size={14} /> Back to Blog
          </Link>
        </div>

        {/* Post header */}
        <header className="mb-8">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className={`text-[11px] font-body font-medium px-2.5 py-1 rounded-full ${CATEGORY_COLORS[post.category] ?? 'bg-purple-brand/10 text-purple-brand'}`}>
              {CATEGORY_LABELS[post.category] ?? post.category}
            </span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl text-ink font-light leading-tight mb-4">
            {post.title}
          </h1>
          <p className="text-ink/60 font-body text-base leading-relaxed mb-4">
            {post.excerpt}
          </p>
          <div className="flex items-center gap-3 text-ink/40 text-xs font-body flex-wrap pb-6 border-b border-purple-brand/8">
            {post.author?.name && (
              <span className="font-medium text-ink/60">{post.author.name}</span>
            )}
            {post.publishedAt && (
              <span className="flex items-center gap-1"><Calendar size={11} /> {fmtDate(post.publishedAt)}</span>
            )}
            {post.readTime && (
              <span className="flex items-center gap-1"><Clock size={11} /> {post.readTime} min read</span>
            )}
          </div>
        </header>

        {/* Content */}
        <article className="prose-custom font-body text-ink/80 text-base leading-relaxed whitespace-pre-wrap mb-12">
          {post.content}
        </article>

        {/* Footer */}
        <div className="border-t border-purple-brand/8 pt-8 pb-16 flex items-center justify-between flex-wrap gap-4">
          <Link to="/blog" className="btn-outline text-sm px-5 py-2">
            <ArrowLeft size={14} /> More Posts
          </Link>
          <Link to="/prayer" className="btn-primary text-sm px-5 py-2">
            <Send size={14} /> Submit a Prayer Request
          </Link>
        </div>
      </div>
    </div>
  );
}
