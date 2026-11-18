import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { useAuth } from './lib/auth';
import { returnTo } from './lib/returnTo';
import { Spinner, LOGO_URL } from './components/ui';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import Waiting from './pages/Waiting';
import Unreachable from './pages/Unreachable';
import ChangePassword from './pages/ChangePassword';
import Home from './pages/Home';
import History from './pages/History';
import { ScanRoute } from './pages/Scan';
import QrDisplay from './pages/QrDisplay';
import Profile from './pages/Profile';
import Members from './pages/hod/Members';
import Workers from './pages/admin/Workers';
import Departments from './pages/admin/Departments';
import Services from './pages/admin/Services';
import Sessions from './pages/admin/Sessions';
import Settings from './pages/admin/Settings';
import Audit from './pages/admin/Audit';

export default function App() {
  const { worker, ready, unreachable, isAdmin, isHod } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="min-h-screen bg-purple-deep flex flex-col items-center justify-center gap-4">
        <img src={LOGO_URL} alt="HPC Global" className="h-14 w-auto object-contain" />
        <Spinner className="text-gold" />
      </div>
    );
  }

  // Signed in on this phone, but the server couldn't be asked who they are.
  // Not signed out — so not the sign-in screen, which would make them think
  // they had to sign in again.
  if (!worker && unreachable) return <Unreachable />;

  // Signed out: only the sign-in screens.
  if (!worker) {
    return (
      <>
        <OfflineBanner />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          {/* When they were sent: a QR code's address is only worth going back to for a minute or so. */}
          <Route path="*" element={<Navigate to="/login" replace state={{ from: location.pathname, at: Date.now() }} />} />
        </Routes>
      </>
    );
  }

  // Signed in but not (yet) allowed in: the matching screen, and nothing else.
  if (worker.status !== 'ACTIVE') return <><OfflineBanner /><Waiting /></>;
  if (worker.mustChangePassword) return <><OfflineBanner /><ChangePassword /></>;

  // Just signed in (or reset a password) on the way somewhere — a QR code
  // scanned while signed out: on to it. The sign-in screen's own navigation
  // can lose the race with this render, so the address it was on decides.
  // A QR code left waiting through approval or a password change has expired: Home instead.
  const backTo = <Navigate to={returnTo(location.state)} replace />;

  return (
    <>
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/history" element={<History />} />
        <Route path="/q/:code" element={<ScanRoute />} />
        <Route path="/profile" element={<Profile />} />
        {isHod && <Route path="/department" element={<Members />} />}
        {(isAdmin || isHod) && <Route path="/display/:sessionId" element={<QrDisplay />} />}
        {isAdmin && <Route path="/admin/workers" element={<Workers />} />}
        {isAdmin && <Route path="/admin/departments" element={<Departments />} />}
        {isAdmin && <Route path="/admin/services" element={<Services />} />}
        {isAdmin && <Route path="/admin/sessions" element={<Sessions />} />}
        {isAdmin && <Route path="/admin/settings" element={<Settings />} />}
        {isAdmin && <Route path="/admin/audit" element={<Audit />} />}
        <Route path="/login" element={backTo} />
        <Route path="/forgot-password" element={backTo} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

/** Clocking in needs the server, so say plainly when there is no connection. */
function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  if (online) return null;
  // The red runs up under an iPhone's status bar; the words sit below it.
  return (
    <div className="fixed top-0 inset-x-0 z-[60] bg-red-600 pt-safe" role="status">
      <div className="text-white text-sm font-body flex items-center justify-center gap-2 py-2 px-4">
        <WifiOff size={15} className="flex-shrink-0" /> You’re offline — clocking in and other changes need a connection.
      </div>
    </div>
  );
}
