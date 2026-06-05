import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PartnerAuthProvider } from './context/PartnerAuthContext';
import PageWrapper from './components/layout/PageWrapper';
import Spinner from './components/ui/Spinner';

// ─── Public pages (lazy) ──────────────────────────────────────────────────────
const Home       = lazy(() => import('./pages/public/Home'));
const About      = lazy(() => import('./pages/public/About'));
const Leadership = lazy(() => import('./pages/public/Leadership'));
const Services   = lazy(() => import('./pages/public/Services'));
const Sermons    = lazy(() => import('./pages/public/Sermons'));
const Events      = lazy(() => import('./pages/public/Events'));
const EventDetail = lazy(() => import('./pages/public/EventDetail'));
const Give           = lazy(() => import('./pages/public/Give'));
const GivingCallback = lazy(() => import('./pages/public/GivingCallback'));
const Ministries = lazy(() => import('./pages/public/Ministries'));
const NewHere    = lazy(() => import('./pages/public/NewHere'));
const Prayer     = lazy(() => import('./pages/public/Prayer'));
const Blog       = lazy(() => import('./pages/public/Blog'));
const BlogPost   = lazy(() => import('./pages/public/BlogPost'));
const Gallery    = lazy(() => import('./pages/public/Gallery'));
const Contact    = lazy(() => import('./pages/public/Contact'));
const NotFound   = lazy(() => import('./pages/public/NotFound'));

// ─── Admin pages (lazy) ───────────────────────────────────────────────────────
const AdminLogin           = lazy(() => import('./pages/admin/AdminLogin'));
const AdminForgotPassword    = lazy(() => import('./pages/admin/AdminForgotPassword'));
const AdminResetPassword     = lazy(() => import('./pages/admin/AdminResetPassword'));
const AdminPartners          = lazy(() => import('./pages/admin/AdminPartners'));
const AdminZoomSchedules     = lazy(() => import('./pages/admin/AdminZoomSchedules'));
const AdminPartnerMessages   = lazy(() => import('./pages/admin/AdminPartnerMessages'));
const AdminPartnerPayments   = lazy(() => import('./pages/admin/AdminPartnerPayments'));
const Partner                = lazy(() => import('./pages/public/Partner'));
const PartnerLogin           = lazy(() => import('./pages/public/PartnerLogin'));
const PartnerSetPassword     = lazy(() => import('./pages/public/PartnerSetPassword'));
const PartnerPortal          = lazy(() => import('./pages/public/PartnerPortal'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminHero      = lazy(() => import('./pages/admin/AdminHero'));
const AdminSermons   = lazy(() => import('./pages/admin/AdminSermons'));
const AdminSermonSeries = lazy(() => import('./pages/admin/AdminSermonSeries'));
const AdminEvents    = lazy(() => import('./pages/admin/AdminEvents'));
const AdminGiving    = lazy(() => import('./pages/admin/AdminGiving'));
const AdminPrayer    = lazy(() => import('./pages/admin/AdminPrayer'));
const AdminVisitors  = lazy(() => import('./pages/admin/AdminVisitors'));
const AdminBlog      = lazy(() => import('./pages/admin/AdminBlog'));
const AdminGallery   = lazy(() => import('./pages/admin/AdminGallery'));
const AdminMinistries = lazy(() => import('./pages/admin/AdminMinistries'));
const AdminLeadership = lazy(() => import('./pages/admin/AdminLeadership'));
const AdminAbout     = lazy(() => import('./pages/admin/AdminAbout'));
const AdminServices  = lazy(() => import('./pages/admin/AdminServices'));
const AdminContact   = lazy(() => import('./pages/admin/AdminContact'));
const AdminSettings  = lazy(() => import('./pages/admin/AdminSettings'));
const AdminUsers     = lazy(() => import('./pages/admin/AdminUsers'));

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/admin/login" replace />;
}

function PublicLayout({ children }) {
  return <PageWrapper>{children}</PageWrapper>;
}

export default function App() {
  return (
    <PartnerAuthProvider>
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<div className="min-h-screen bg-purple-deep flex items-center justify-center"><Spinner /></div>}>
          <Routes>

            {/* ── Partner routes ── */}
            <Route path="/partner"               element={<PublicLayout><Partner /></PublicLayout>} />
            <Route path="/partner/login"         element={<PartnerLogin />} />
            <Route path="/partner/set-password"  element={<PartnerSetPassword />} />
            <Route path="/partner/portal"        element={<PartnerPortal />} />

            {/* ── Public routes ── */}
            <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
            <Route path="/about"      element={<PublicLayout><About /></PublicLayout>} />
            <Route path="/leadership" element={<PublicLayout><Leadership /></PublicLayout>} />
            <Route path="/services"   element={<PublicLayout><Services /></PublicLayout>} />
            <Route path="/sermons"    element={<PublicLayout><Sermons /></PublicLayout>} />
            <Route path="/events"     element={<PublicLayout><Events /></PublicLayout>} />
            <Route path="/events/:slug" element={<PublicLayout><EventDetail /></PublicLayout>} />
            <Route path="/give"              element={<PublicLayout><Give /></PublicLayout>} />
            <Route path="/giving/callback"  element={<GivingCallback />} />
            <Route path="/ministries" element={<PublicLayout><Ministries /></PublicLayout>} />
            <Route path="/new-here"   element={<PublicLayout><NewHere /></PublicLayout>} />
            <Route path="/prayer"     element={<PublicLayout><Prayer /></PublicLayout>} />
            <Route path="/blog"       element={<PublicLayout><Blog /></PublicLayout>} />
            <Route path="/blog/:slug" element={<PublicLayout><BlogPost /></PublicLayout>} />
            <Route path="/gallery"    element={<PublicLayout><Gallery /></PublicLayout>} />
            <Route path="/contact"    element={<PublicLayout><Contact /></PublicLayout>} />

            {/* ── Admin routes ── */}
            <Route path="/admin/login"            element={<AdminLogin />} />
            <Route path="/admin/forgot-password"  element={<AdminForgotPassword />} />
            <Route path="/admin/reset-password"   element={<AdminResetPassword />} />
            <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/hero"       element={<ProtectedRoute><AdminHero /></ProtectedRoute>} />
            <Route path="/admin/sermons"    element={<ProtectedRoute><AdminSermons /></ProtectedRoute>} />
            <Route path="/admin/sermon-series" element={<ProtectedRoute><AdminSermonSeries /></ProtectedRoute>} />
            <Route path="/admin/events"     element={<ProtectedRoute><AdminEvents /></ProtectedRoute>} />
            <Route path="/admin/giving"     element={<ProtectedRoute><AdminGiving /></ProtectedRoute>} />
            <Route path="/admin/prayer"     element={<ProtectedRoute><AdminPrayer /></ProtectedRoute>} />
            <Route path="/admin/visitors"   element={<ProtectedRoute><AdminVisitors /></ProtectedRoute>} />
            <Route path="/admin/blog"       element={<ProtectedRoute><AdminBlog /></ProtectedRoute>} />
            <Route path="/admin/gallery"    element={<ProtectedRoute><AdminGallery /></ProtectedRoute>} />
            <Route path="/admin/ministries" element={<ProtectedRoute><AdminMinistries /></ProtectedRoute>} />
            <Route path="/admin/leadership" element={<ProtectedRoute><AdminLeadership /></ProtectedRoute>} />
            <Route path="/admin/about"      element={<ProtectedRoute><AdminAbout /></ProtectedRoute>} />
            <Route path="/admin/services"   element={<ProtectedRoute><AdminServices /></ProtectedRoute>} />
            <Route path="/admin/settings"   element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
            <Route path="/admin/contact"    element={<ProtectedRoute><AdminContact /></ProtectedRoute>} />
            <Route path="/admin/users"           element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
            <Route path="/admin/partners"        element={<ProtectedRoute><AdminPartners /></ProtectedRoute>} />
            <Route path="/admin/zoom-schedules"    element={<ProtectedRoute><AdminZoomSchedules /></ProtectedRoute>} />
            <Route path="/admin/partner-messages"  element={<ProtectedRoute><AdminPartnerMessages /></ProtectedRoute>} />
            <Route path="/admin/partner-payments"  element={<ProtectedRoute><AdminPartnerPayments /></ProtectedRoute>} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
    </PartnerAuthProvider>
  );
}
