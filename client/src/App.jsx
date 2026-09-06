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
const BookAppointment = lazy(() => import('./pages/public/BookAppointment'));
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
const AdminAppointments      = lazy(() => import('./pages/admin/AdminAppointments'));
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
const AdminReports   = lazy(() => import('./pages/admin/AdminReports'));

// ─── Head-of-department portal (lazy) ─────────────────────────────────────────
const HodReportForm  = lazy(() => import('./pages/hod/HodReportForm'));
const HodReports     = lazy(() => import('./pages/hod/HodReports'));

// Where an account belongs once signed in. HoDs share the admin login but have
// no access to the content modules, so sending them to /admin would land them
// on a dashboard whose every request the server rejects.
const HOME_FOR_ROLE = { HOD: '/hod' };
const homeFor = (user) => HOME_FOR_ROLE[user?.role] ?? '/admin';

/**
 * Gate a route on being signed in and, optionally, on holding one of `roles`.
 * A signed-in account with the wrong role is redirected to its own home rather
 * than to the login page — it is not an authentication problem.
 */
function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/admin/login" replace />;
  if (roles && !roles.includes(user?.role)) return <Navigate to={homeFor(user)} replace />;
  return children;
}

// Everything under /admin is for the content-admin roles only.
const ADMIN_ROLES = ['SUPER_ADMIN', 'CONTENT_EDITOR', 'MEDIA_MANAGER'];

function AdminRoute({ children }) {
  return <ProtectedRoute roles={ADMIN_ROLES}>{children}</ProtectedRoute>;
}

function HodRoute({ children }) {
  return <ProtectedRoute roles={['HOD']}>{children}</ProtectedRoute>;
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
            <Route path="/appointments"     element={<PublicLayout><BookAppointment /></PublicLayout>} />
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
            <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
            <Route path="/admin/hero"       element={<AdminRoute><AdminHero /></AdminRoute>} />
            <Route path="/admin/sermons"    element={<AdminRoute><AdminSermons /></AdminRoute>} />
            <Route path="/admin/sermon-series" element={<AdminRoute><AdminSermonSeries /></AdminRoute>} />
            <Route path="/admin/events"     element={<AdminRoute><AdminEvents /></AdminRoute>} />
            <Route path="/admin/giving"     element={<AdminRoute><AdminGiving /></AdminRoute>} />
            <Route path="/admin/prayer"     element={<AdminRoute><AdminPrayer /></AdminRoute>} />
            <Route path="/admin/visitors"   element={<AdminRoute><AdminVisitors /></AdminRoute>} />
            <Route path="/admin/blog"       element={<AdminRoute><AdminBlog /></AdminRoute>} />
            <Route path="/admin/gallery"    element={<AdminRoute><AdminGallery /></AdminRoute>} />
            <Route path="/admin/ministries" element={<AdminRoute><AdminMinistries /></AdminRoute>} />
            <Route path="/admin/leadership" element={<AdminRoute><AdminLeadership /></AdminRoute>} />
            <Route path="/admin/about"      element={<AdminRoute><AdminAbout /></AdminRoute>} />
            <Route path="/admin/services"   element={<AdminRoute><AdminServices /></AdminRoute>} />
            <Route path="/admin/settings"   element={<AdminRoute><AdminSettings /></AdminRoute>} />
            <Route path="/admin/contact"    element={<AdminRoute><AdminContact /></AdminRoute>} />
            <Route path="/admin/users"           element={<AdminRoute><AdminUsers /></AdminRoute>} />
            <Route path="/admin/partners"        element={<AdminRoute><AdminPartners /></AdminRoute>} />
            <Route path="/admin/zoom-schedules"    element={<AdminRoute><AdminZoomSchedules /></AdminRoute>} />
            <Route path="/admin/partner-messages"  element={<AdminRoute><AdminPartnerMessages /></AdminRoute>} />
            <Route path="/admin/partner-payments"  element={<AdminRoute><AdminPartnerPayments /></AdminRoute>} />
            <Route path="/admin/appointments"      element={<AdminRoute><AdminAppointments /></AdminRoute>} />

            <Route path="/admin/reports"           element={<AdminRoute><AdminReports /></AdminRoute>} />

            {/* ─── Head-of-department portal ─────────────────────────────── */}
            <Route path="/hod"                      element={<HodRoute><HodReportForm /></HodRoute>} />
            <Route path="/hod/reports"              element={<HodRoute><HodReports /></HodRoute>} />
            <Route path="/hod/reports/:id/edit"     element={<HodRoute><HodReportForm /></HodRoute>} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
    </PartnerAuthProvider>
  );
}
