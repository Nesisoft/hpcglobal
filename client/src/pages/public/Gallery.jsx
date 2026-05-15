import { useState, useCallback, useEffect } from 'react';
import SEO from '../../components/ui/SEO';
import { Images, Calendar, X, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import { publicApi } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import SectionHero from '../../components/ui/SectionHero';

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function Lightbox({ photos, startIndex, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const photo = photos[idx];

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(photos.length - 1, i + 1));
      if (e.key === 'ArrowLeft')  setIdx((i) => Math.max(0, i - 1));
      if (e.key === 'Escape')     onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [photos.length, onClose]);

  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={onClose}>
      {/* Close */}
      <button
        className="absolute top-4 right-4 text-white/60 hover:text-white p-2"
        onClick={onClose}
      >
        <X size={24} />
      </button>

      {/* Prev */}
      {idx > 0 && (
        <button
          className="absolute left-4 text-white/60 hover:text-white p-2"
          onClick={(e) => { e.stopPropagation(); setIdx((i) => i - 1); }}
        >
          <ChevronLeft size={32} />
        </button>
      )}

      {/* Image */}
      <div className="max-w-5xl max-h-[85vh] mx-12 flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <img
          src={photo.url}
          alt={photo.caption ?? ''}
          className="max-w-full max-h-[78vh] object-contain rounded"
        />
        {photo.caption && (
          <p className="text-white/60 text-sm font-body mt-3 text-center">{photo.caption}</p>
        )}
        <p className="text-white/30 text-xs font-body mt-1">{idx + 1} / {photos.length}</p>
      </div>

      {/* Next */}
      {idx < photos.length - 1 && (
        <button
          className="absolute right-4 text-white/60 hover:text-white p-2"
          onClick={(e) => { e.stopPropagation(); setIdx((i) => i + 1); }}
        >
          <ChevronRight size={32} />
        </button>
      )}
    </div>
  );
}

function AlbumView({ album, onBack }) {
  const fetchFn = useCallback(() => publicApi.getAlbum(album.id), [album.id]);
  const { data, loading } = useApi(fetchFn);
  const photos = data?.photos ?? [];

  const [lightboxIdx, setLightboxIdx] = useState(null);

  return (
    <div>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-purple-brand text-sm font-body hover:underline mb-6"
      >
        <ChevronLeft size={16} /> All Albums
      </button>
      <h2 className="font-display text-2xl text-ink font-light mb-1">{album.name}</h2>
      {album.description && (
        <p className="text-ink/55 font-body text-sm mb-2">{album.description}</p>
      )}
      {album.eventDate && (
        <p className="text-ink/40 text-xs font-body mb-6 flex items-center gap-1">
          <Calendar size={11} /> {fmtDate(album.eventDate)}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1,2,3,4,5,6,7,8].map((i) => <div key={i} className="aspect-square bg-white rounded-lg animate-pulse" />)}
        </div>
      ) : photos.length === 0 ? (
        <div className="text-center py-16">
          <Images size={40} className="text-purple-brand/20 mx-auto mb-3" />
          <p className="text-ink/50 font-body text-sm">No photos in this album yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              onClick={() => setLightboxIdx(i)}
              className="relative aspect-square overflow-hidden rounded-lg bg-purple-brand/5 group"
            >
              <img
                src={photo.url}
                alt={photo.caption ?? ''}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))}
        </div>
      )}

      {lightboxIdx !== null && (
        <Lightbox photos={photos} startIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />
      )}
    </div>
  );
}

export default function Gallery() {
  const fetchFn = useCallback(() => publicApi.getGallery(), []);
  const { data: rawData, loading } = useApi(fetchFn);
  const albums = Array.isArray(rawData) ? rawData : [];

  const [selectedAlbum, setSelectedAlbum] = useState(null);

  if (selectedAlbum) {
    return (
      <>
        <SectionHero title="Gallery" breadcrumb="Home / Gallery" />
        <section className="section-pad bg-cream">
          <div className="container-page">
            <AlbumView album={selectedAlbum} onBack={() => setSelectedAlbum(null)} />
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <SEO title="Gallery" description="Photo albums from HPC Global events, services, and community gatherings." />
      <SectionHero
        title="Gallery"
        subtitle="Moments of worship, community, and celebration captured in time."
        breadcrumb="Home / Gallery"
      />

      <section className="section-pad bg-cream">
        <div className="container-page">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1,2,3,4,5,6].map((i) => <div key={i} className="h-56 bg-white rounded-xl animate-pulse" />)}
            </div>
          ) : albums.length === 0 ? (
            <div className="text-center py-20">
              <Images size={48} className="text-purple-brand/20 mx-auto mb-4" />
              <h3 className="font-display text-2xl text-ink font-light mb-2">Gallery coming soon</h3>
              <p className="text-ink/50 font-body text-sm">Photos from our events and services will appear here.</p>
            </div>
          ) : (
            <>
              <div className="text-center max-w-2xl mx-auto mb-12">
                <p className="section-label mb-3">Photo Albums</p>
                <h2 className="section-heading mb-4">Moments That Matter</h2>
                <p className="text-ink/60 font-body text-base">
                  Browse through our collection of photos from services, events, and community gatherings.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {albums.map((album) => (
                  <button
                    key={album.id}
                    onClick={() => setSelectedAlbum(album)}
                    className="group text-left bg-white rounded-xl border border-purple-brand/8 overflow-hidden hover:shadow-md transition-all duration-300"
                  >
                    <div className="aspect-[4/3] relative overflow-hidden bg-purple-brand/5">
                      {album.coverImage ? (
                        <img
                          src={album.coverImage}
                          alt={album.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Images size={36} className="text-purple-brand/20" />
                        </div>
                      )}
                      <div className="absolute bottom-3 right-3 bg-black/60 text-white text-[10px] font-body px-2 py-1 rounded-full">
                        {album._count?.photos ?? 0} photos
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="font-display text-lg text-ink font-light group-hover:text-purple-brand transition-colors mb-1">
                        {album.name}
                      </h3>
                      {album.description && (
                        <p className="text-ink/50 text-xs font-body line-clamp-2 mb-1">{album.description}</p>
                      )}
                      {album.eventDate && (
                        <p className="text-ink/35 text-[11px] font-body flex items-center gap-1">
                          <Calendar size={10} /> {fmtDate(album.eventDate)}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}
