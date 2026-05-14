import { useState } from 'react';
import { Play, Filter, Search, Radio } from 'lucide-react';
import { FaYoutube } from 'react-icons/fa';
import { useApi } from '../../hooks/useApi';
import { publicApi } from '../../services/api';
import { formatDate } from '../../utils/formatDate';
import SectionHero from '../../components/ui/SectionHero';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';

const SERIES = ['All', 'Dominion Series', 'The Word of Hope', 'Prophetic Foundations', 'Kingdom Leaders'];

function SermonCard({ video }) {
  return (
    <a
      href={video.url || `https://youtube.com/watch?v=${video.id}`}
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
          {formatDate(video.publishedAt || video.datePracticed)}
        </p>
      </div>
    </a>
  );
}

export default function Sermons() {
  const [search, setSearch]       = useState('');
  const [activeSeries, setSeries] = useState('All');

  const { data: ytVideos, loading: ytLoading } = useApi(() => publicApi.getYouTube({ count: 12 }));
  const { data: dbSermons, loading: dbLoading } = useApi(publicApi.getSermons);

  const videos = ytVideos || [];
  const loading = ytLoading || dbLoading;

  const filtered = videos.filter((v) => {
    const matchSearch = !search || v.title.toLowerCase().includes(search.toLowerCase());
    const matchSeries = activeSeries === 'All' || (v.series === activeSeries);
    return matchSearch && matchSeries;
  });

  return (
    <>
      <SectionHero
        title="Sermons & Media"
        subtitle="Access our library of messages — transformative, prophetic, and Word-based."
        breadcrumb="Home / Sermons"
      />

      {/* Featured sermon */}
      <section className="section-pad bg-purple-deep">
        <div className="container-page">
          <p className="section-label text-gold mb-4">Latest Message</p>
          {loading ? <Spinner /> : videos[0] && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
              <div className="rounded-xl overflow-hidden aspect-video">
                <iframe
                  src={`https://www.youtube.com/embed/${videos[0].id}?rel=0`}
                  title={videos[0].title}
                  className="w-full h-full"
                  allowFullScreen
                />
              </div>
              <div>
                <h2 className="section-heading-light mb-3">{videos[0].title}</h2>
                <p className="text-white/50 font-body text-sm mb-6">{formatDate(videos[0].publishedAt)}</p>
                <a
                  href={videos[0].url}
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

      {/* Live stream */}
      <section className="bg-purple-brand py-8">
        <div className="container-page flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white font-body text-sm font-medium">Live Sunday 9 AM & Friday 6:30 PM GMT</span>
            </div>
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

      {/* Sermon library */}
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
            <div className="flex items-center gap-2 flex-wrap">
              <Filter size={14} className="text-ink/40" />
              {SERIES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSeries(s)}
                  className={`px-3 py-1.5 text-xs font-body font-medium rounded transition-colors ${
                    activeSeries === s
                      ? 'bg-gold text-purple-deep'
                      : 'bg-white border border-purple-brand/10 text-ink/60 hover:border-gold/40'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
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
