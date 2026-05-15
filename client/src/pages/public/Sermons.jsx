import { useState, useCallback } from 'react';
import { Play, Search } from 'lucide-react';
import { FaYoutube } from 'react-icons/fa';
import { useApi } from '../../hooks/useApi';
import { publicApi } from '../../services/api';
import { formatDate } from '../../utils/formatDate';
import SectionHero from '../../components/ui/SectionHero';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';

function SermonCard({ video }) {
  return (
    <a
      href={video.url || `https://youtube.com/watch?v=${video.youtubeId || video.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="card group overflow-hidden"
    >
      <div className="relative">
        <img
          src={video.thumbnail || video.thumbnailUrl}
          alt={video.title}
          className="w-full aspect-video object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute inset-0 bg-purple-deep/30 group-hover:bg-purple-deep/10 transition-colors flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-gold/90 flex items-center justify-center shadow-lg">
            <Play size={18} className="text-purple-deep ml-0.5" />
          </div>
        </div>
        {video.series && (
          <div className="absolute top-3 left-3">
            <Badge variant="gold">{video.series}</Badge>
          </div>
        )}
      </div>
      <div className="p-5">
        <h3 className="font-display text-ink text-lg font-normal leading-snug line-clamp-2 mb-2">
          {video.title}
        </h3>
        {video.preacher && (
          <p className="text-ink/60 font-body text-xs mb-1">{video.preacher}</p>
        )}
        {video.scripture && (
          <p className="text-gold font-body text-xs mb-2">{video.scripture}</p>
        )}
        <p className="text-ink/40 font-body text-xs">
          {formatDate(video.datePracticed || video.publishedAt)}
        </p>
      </div>
    </a>
  );
}

export default function Sermons() {
  const [search, setSearch]         = useState('');
  const [activeSeries, setSeries]   = useState('');

  const fetchDb = useCallback(
    () => publicApi.getSermons({ limit: 24, series: activeSeries || undefined }),
    [activeSeries],
  );
  const { data: dbData, loading: dbLoading } = useApi(fetchDb);
  const { data: ytVideos, loading: ytLoading } = useApi(() => publicApi.getYouTube({ count: 12 }));

  const dbSermons = dbData?.sermons ?? [];
  const useDb = dbSermons.length > 0;

  // Source: DB sermons if available, else YouTube videos normalised to same shape
  const rawList = useDb
    ? dbSermons
    : (Array.isArray(ytVideos) ? ytVideos : []).map((v) => ({
        id:          v.id,
        title:       v.title,
        thumbnail:   v.thumbnail,
        thumbnailUrl:v.thumbnail,
        youtubeId:   v.id,
        url:         v.url,
        datePracticed: v.publishedAt,
      }));

  // Derive series list from DB data
  const seriesOptions = useDb
    ? ['', ...new Set(dbSermons.map((s) => s.series).filter(Boolean))]
    : [];

  // Client-side search filter
  const filtered = rawList.filter((v) => {
    const q = search.toLowerCase();
    return !q
      || v.title?.toLowerCase().includes(q)
      || v.preacher?.toLowerCase().includes(q)
      || v.scripture?.toLowerCase().includes(q);
  });

  const loading = dbLoading || ytLoading;
  const featuredVideo = filtered[0] ?? null;

  return (
    <>
      <SectionHero
        title="Sermons & Media"
        subtitle="Access our library of messages — transformative, prophetic, and Word-based."
        breadcrumb="Home / Sermons"
      />

      {/* Featured */}
      <section className="section-pad bg-purple-deep">
        <div className="container-page">
          <p className="section-label text-gold mb-4">Latest Message</p>
          {loading ? <Spinner /> : featuredVideo && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
              <div className="rounded-xl overflow-hidden aspect-video">
                <iframe
                  src={`https://www.youtube.com/embed/${featuredVideo.youtubeId || featuredVideo.id}?rel=0`}
                  title={featuredVideo.title}
                  className="w-full h-full"
                  allowFullScreen
                />
              </div>
              <div>
                <h2 className="section-heading-light mb-2">{featuredVideo.title}</h2>
                {featuredVideo.preacher && (
                  <p className="text-gold font-body text-sm mb-1">{featuredVideo.preacher}</p>
                )}
                {featuredVideo.scripture && (
                  <p className="text-white/50 font-body text-xs mb-3">{featuredVideo.scripture}</p>
                )}
                <p className="text-white/40 font-body text-sm mb-6">
                  {formatDate(featuredVideo.datePracticed || featuredVideo.publishedAt)}
                </p>
                <a
                  href={featuredVideo.url || `https://youtube.com/watch?v=${featuredVideo.youtubeId || featuredVideo.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                >
                  <FaYoutube size={16} /> Watch on YouTube
                </a>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Live stream banner */}
      <section className="bg-purple-brand py-8">
        <div className="container-page flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white font-body text-sm font-medium">Live Sunday 9 AM & Friday 6:30 PM GMT</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://youtube.com/@prophetclottey"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded font-body text-sm font-medium hover:bg-red-700 transition-colors"
            >
              <FaYoutube size={16} /> Subscribe
            </a>
            <span className="text-white/50 font-body text-xs">@prophetclottey</span>
          </div>
        </div>
      </section>

      {/* Library */}
      <section className="section-pad bg-cream">
        <div className="container-page">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
              <input
                type="text"
                placeholder="Search sermons…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-9"
              />
            </div>
            {seriesOptions.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap">
                {seriesOptions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSeries(s)}
                    className={`px-3 py-1.5 text-xs font-body font-medium rounded transition-colors ${
                      activeSeries === s
                        ? 'bg-gold text-purple-deep'
                        : 'bg-white border border-purple-brand/10 text-ink/60 hover:border-gold/40'
                    }`}
                  >
                    {s || 'All'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading ? (
            <Spinner />
          ) : filtered.length === 0 ? (
            <p className="text-center text-ink/40 font-body py-16">No sermons found</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filtered.map((v) => <SermonCard key={v.id} video={v} />)}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
