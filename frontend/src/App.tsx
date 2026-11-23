import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./hooks/auth";
import { AppShell } from "./layouts/AppShell";
import { PublicLayout } from "./layouts/PublicLayout";
import { Skeleton } from "./components/ui/primitives";

const Home = lazy(() => import("./pages/public/Home"));
const Demo = lazy(() => import("./pages/public/Demo"));
const Login = lazy(() => import("./pages/public/Login"));
const Overview = lazy(() => import("./pages/app/Overview"));
const Complaints = lazy(() => import("./pages/app/Complaints"));
const ComplaintDetail = lazy(() => import("./pages/app/ComplaintDetail"));
const ComplaintNew = lazy(() => import("./pages/app/ComplaintNew"));
const AiAnalysis = lazy(() => import("./pages/app/AiAnalysis"));
const RootCause = lazy(() => import("./pages/app/RootCause"));
const Capa = lazy(() => import("./pages/app/Capa"));
const CapaDetail = lazy(() => import("./pages/app/CapaDetail"));
const Risk = lazy(() => import("./pages/app/Risk"));
const Analytics = lazy(() => import("./pages/app/Analytics"));
const DataManagement = lazy(() => import("./pages/app/DataManagement"));
const Reports = lazy(() => import("./pages/app/Reports"));
const Settings = lazy(() => import("./pages/app/Settings"));
const Bookings = lazy(() => import("./pages/admin/Bookings"));
const Users = lazy(() => import("./pages/admin/Users"));
const Models = lazy(() => import("./pages/admin/Models"));
const Audit = lazy(() => import("./pages/admin/Audit"));
const NotFound = lazy(() => import("./pages/NotFound"));

function Loading() {
  return <div className="p-6 space-y-3" aria-busy="true" aria-label="Loading"><Skeleton className="h-8 w-64" /><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></div>;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "admin") return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/demo" element={<Demo />} />
        </Route>
        <Route path="/login" element={<Login />} />
        <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route index element={<Overview />} />
          <Route path="complaints" element={<Complaints />} />
          <Route path="complaints/new" element={<ComplaintNew />} />
          <Route path="complaints/:id" element={<ComplaintDetail />} />
          <Route path="ai" element={<AiAnalysis />} />
          <Route path="root-cause" element={<RootCause />} />
          <Route path="capa" element={<Capa />} />
          <Route path="capa/:id" element={<CapaDetail />} />
          <Route path="risk" element={<Risk />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="data" element={<DataManagement />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="admin/bookings" element={<RequireAdmin><Bookings /></RequireAdmin>} />
          <Route path="admin/users" element={<RequireAdmin><Users /></RequireAdmin>} />
          <Route path="admin/models" element={<RequireAdmin><Models /></RequireAdmin>} />
          <Route path="admin/audit" element={<RequireAdmin><Audit /></RequireAdmin>} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
