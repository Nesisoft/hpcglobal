import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hpc_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Attempt token refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('hpc_refresh_token');
        const { data } = await axios.post('/api/auth/refresh', { refreshToken });
        localStorage.setItem('hpc_access_token', data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        localStorage.removeItem('hpc_access_token');
        localStorage.removeItem('hpc_refresh_token');
        window.location.href = '/admin/login';
      }
    }
    return Promise.reject(err);
  }
);

// ─── Public endpoints ───────────────────────────────────────────────────────
export const publicApi = {
  getHero:         () => api.get('/hero'),
  getServiceTimes: () => api.get('/service-times'),
  getSermons:      (params) => api.get('/sermons', { params }),
  getSermon:       (id) => api.get(`/sermons/${id}`),
  getEvents:       (params) => api.get('/events', { params }),
  getEvent:        (slug) => api.get(`/events/${slug}`),
  rsvpEvent:       (id, data) => api.post(`/events/${id}/rsvp`, data),
  getYouTube:      (params) => api.get('/youtube/latest', { params }),
  getBlog:         (params) => api.get('/blog', { params }),
  getBlogPost:     (slug) => api.get(`/blog/${slug}`),
  getGallery:      () => api.get('/gallery'),
  getAlbum:        (id) => api.get(`/gallery/${id}`),
  getMinistries:   () => api.get('/ministries'),
  getLeadership:   () => api.get('/leadership'),
  getAbout:        () => api.get('/about'),
  getSettings:     () => api.get('/settings'),
  submitPrayer:    (data) => api.post('/prayer', data),
  submitVisitor:   (data) => api.post('/visitors', data),
  submitContact:   (data) => api.post('/contact/message', data),
  initiateGiving: (data) => api.post('/give', data),
  verifyGiving:   (ref)  => api.get(`/give/verify/${ref}`),
};

// ─── Admin endpoints ─────────────────────────────────────────────────────────
export const adminApi = {
  login:   (data) => api.post('/auth/login', data),
  refresh: (data) => api.post('/auth/refresh', data),
  logout:  () => api.post('/auth/logout'),

  getDashboard: () => api.get('/admin/dashboard'),

  uploadImage: (fd, folder) =>
    api.post(`/admin/upload${folder ? `?folder=${folder}` : ''}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  getHeroSlides:   ()      => api.get('/admin/hero'),
  createHeroSlide: (d)     => api.post('/admin/hero', d),
  updateHeroSlide: (id, d) => api.put(`/admin/hero/${id}`, d),
  deleteHeroSlide: (id)    => api.delete(`/admin/hero/${id}`),

  getSermons:       (params) => api.get('/admin/sermons', { params }),
  getYoutubeMeta:   (url)    => api.get('/admin/sermons/youtube-meta', { params: { url } }),
  createSermon:     (data)   => api.post('/admin/sermons', data),
  updateSermon:     (id, d)  => api.put(`/admin/sermons/${id}`, d),
  deleteSermon:     (id)     => api.delete(`/admin/sermons/${id}`),

  getSermonSeries:    ()      => api.get('/admin/sermon-series'),
  createSermonSeries: (d)     => api.post('/admin/sermon-series', d),
  updateSermonSeries: (id, d) => api.put(`/admin/sermon-series/${id}`, d),
  deleteSermonSeries: (id)    => api.delete(`/admin/sermon-series/${id}`),
  reorderSermonSeries: (ids)  => api.put('/admin/sermon-series/reorder', { ids }),

  getEvents:      (p)    => api.get('/admin/events', { params: p }),
  createEvent:    (d)    => api.post('/admin/events', d),
  updateEvent:    (id,d) => api.put(`/admin/events/${id}`, d),
  deleteEvent:    (id)   => api.delete(`/admin/events/${id}`),
  getEventRsvps:  (id)   => api.get(`/admin/events/${id}/rsvps`),
  exportEventRsvps: (id) => api.get(`/admin/events/${id}/rsvps/export`, { responseType: 'blob' }),

  getGiving:     (p)   => api.get('/admin/giving', { params: p }),
  givingSummary: ()    => api.get('/admin/giving/summary'),
  exportGiving:  (p)   => api.get('/admin/giving/export', { params: p, responseType: 'blob' }),
  exportVisitors: (p)  => api.get('/admin/visitors/export', { params: p, responseType: 'blob' }),

  getPrayer:    (p)    => api.get('/admin/prayer', { params: p }),
  updatePrayer: (id,d) => api.put(`/admin/prayer/${id}`, d),

  getVisitors:      (p)    => api.get('/admin/visitors', { params: p }),
  updateVisitor:    (id,d) => api.put(`/admin/visitors/${id}`, d),
  bulkUpdateVisitors: (d)  => api.put('/admin/visitors/bulk', d),

  getBlog:       (p)    => api.get('/admin/blog', { params: p }),
  createPost:    (d)    => api.post('/admin/blog', d),
  updatePost:    (id,d) => api.put(`/admin/blog/${id}`, d),
  deletePost:    (id)   => api.delete(`/admin/blog/${id}`),

  getAlbums:     ()       => api.get('/admin/gallery/albums'),
  getAlbum:      (id)     => api.get(`/admin/gallery/albums/${id}`),
  createAlbum:   (d)      => api.post('/admin/gallery/albums', d),
  updateAlbum:   (id, d)  => api.put(`/admin/gallery/albums/${id}`, d),
  deleteAlbum:   (id)     => api.delete(`/admin/gallery/albums/${id}`),
  reorderAlbums: (ids)    => api.put('/admin/gallery/albums/reorder', { ids }),
  getPhotos:     (id)     => api.get(`/admin/gallery/albums/${id}/photos`),
  uploadPhotos:  (id, fd) => api.post(`/admin/gallery/albums/${id}/photos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updatePhoto:   (id, d)  => api.put(`/admin/gallery/photos/${id}`, d),
  deletePhoto:   (id)     => api.delete(`/admin/gallery/photos/${id}`),

  getMinistries:    ()      => api.get('/admin/ministries'),
  createMinistry:   (d)     => api.post('/admin/ministries', d),
  updateMinistry:   (id,d)  => api.put(`/admin/ministries/${id}`, d),
  deleteMinistry:   (id)    => api.delete(`/admin/ministries/${id}`),
  reorderMinistries: (ids)  => api.put('/admin/ministries/reorder', { ids }),

  getLeadership:    ()      => api.get('/admin/leadership'),
  createProfile:    (d)     => api.post('/admin/leadership', d),
  updateProfile:    (id,d)  => api.put(`/admin/leadership/${id}`, d),
  deleteProfile:    (id)    => api.delete(`/admin/leadership/${id}`),
  reorderProfiles:  (ids)   => api.put('/admin/leadership/reorder', { ids }),

  getAbout:   ()  => api.get('/admin/about'),
  updateAbout: (d) => api.put('/admin/about', d),

  getServiceTimes:        ()       => api.get('/admin/service-times'),
  createServiceTime:      (d)      => api.post('/admin/service-times', d),
  updateServiceTime:      (id, d)  => api.put(`/admin/service-times/${id}`, d),
  deleteServiceTime:      (id)     => api.delete(`/admin/service-times/${id}`),
  uploadServiceTimeImage: (id, fd) => api.post(`/admin/service-times/${id}/image`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),

  getSettings:    ()  => api.get('/admin/settings'),
  updateSettings: (d) => api.put('/admin/settings', d),

  getMessages:  (p)    => api.get('/admin/contact/messages', { params: p }),
  readMessage:  (id)   => api.put(`/admin/contact/messages/${id}`),

  getUsers:     ()      => api.get('/admin/users'),
  createUser:   (d)     => api.post('/admin/users', d),
  updateUser:   (id,d)  => api.put(`/admin/users/${id}`, d),
  deleteUser:   (id)    => api.delete(`/admin/users/${id}`),

  getPartners:    (p)   => api.get('/admin/partners', { params: p }),
  updatePartner:  (id,d)=> api.put(`/admin/partners/${id}`, d),
  activatePartner:(id)  => api.put(`/admin/partners/${id}/activate`),
  deletePartner:  (id)  => api.delete(`/admin/partners/${id}`),

  getZoomSchedules:     ()      => api.get('/admin/zoom-schedules'),
  createZoomSchedule:   (d)     => api.post('/admin/zoom-schedules', d),
  updateZoomSchedule:   (id,d)  => api.put(`/admin/zoom-schedules/${id}`, d),
  deleteZoomSchedule:   (id)    => api.delete(`/admin/zoom-schedules/${id}`),

  getPartnerMessages:   ()      => api.get('/admin/partner-messages'),
  createPartnerMessage: (d)     => api.post('/admin/partner-messages', d),
  updatePartnerMessage: (id,d)  => api.put(`/admin/partner-messages/${id}`, d),
  deletePartnerMessage: (id)    => api.delete(`/admin/partner-messages/${id}`),
};

export default api;
