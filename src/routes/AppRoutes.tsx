import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import ContactsPage from '../pages/ContactsPage';
import LoginPage from '../pages/LoginPage';
import MemberDetailPage from '../pages/MemberDetailPage';
import MemberFormPage from '../pages/MemberFormPage';
import ProgramsPage from '../pages/ProgramsPage';
import ProgramDetailPage from '../pages/ProgramDetailPage';
import StaffPage from '../pages/StaffPage';
import UsersPage from '../pages/UsersPage';
import ImportsPage from '../pages/ImportsPage';
import AnnouncementsPage from '../pages/AnnouncementsPage';
import AttendancePage from '../pages/AttendancePage';
import ContributionsPage from '../pages/ContributionsPage';
import FieldBuilderPage from '../pages/FieldBuilderPage';
import GroupLeadersPage from '../pages/GroupLeaders';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import ProtectedRoute from './ProtectedRoute';
import { routeItems } from './routeItems';
import { useAuth } from '../features/auth/AuthContext';

const DashboardPage = lazy(() => import('../pages/DashboardPage'));

function DashboardFallback() {
  return <div className="animate-pulse rounded-2xl border border-stone-200 bg-white px-6 py-16 text-center text-sm font-medium text-slate-500">Loading dashboard...</div>;
}

export default function AppRoutes() {
  const { role } = useAuth();
  const standardRoutes = routeItems.filter((item) => !item.adminOnly);
  const adminRoutes = routeItems.filter((item) => item.adminOnly);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          {standardRoutes.map((item) => (
            <Route
              key={item.path}
              path={item.path.replace(/^\//, '')}
              element={item.path === '/contacts'
                ? <ContactsPage />
                : item.path === '/dashboard'
                  ? <Suspense fallback={<DashboardFallback />}><DashboardPage /></Suspense>
                : item.path === '/programs'
                  ? <ProgramsPage />
                  : item.path === '/staff'
                    ? role === 'admin' || role === 'user' || role === 'viewer' ? <StaffPage /> : <Navigate to="/dashboard" replace />
                    : item.path === '/attendance'
                      ? <AttendancePage />
                    : item.path === '/contributions'
                      ? <ContributionsPage />
                    : item.path === '/announcements'
                      ? <AnnouncementsPage />
                        : item.path === '/imports'
                          ? <ProtectedRoute allowedRoles={['admin', 'user']}><ImportsPage /></ProtectedRoute>
                        : item.path === '/field-builder'
                          ? <ProtectedRoute allowedRoles={['admin', 'user']}><FieldBuilderPage /></ProtectedRoute>
                      : <PlaceholderPage title={item.label} description={item.description} />}
            />
          ))}
          <Route element={<ProtectedRoute requiredRole="admin" />}>
            {adminRoutes.map((item) => (
              <Route
                key={item.path}
                path={item.path.replace(/^\//, '')}
                element={item.path === '/users'
                  ? <UsersPage />
                  : item.path === '/group-leaders'
                    ? <GroupLeadersPage />
                  : item.path === '/imports'
                    ? <ImportsPage />
                    : item.path === '/field-builder'
                      ? <FieldBuilderPage />
                  : <PlaceholderPage title={item.label} description={item.description} />}
              />
            ))}
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['admin', 'user']} />}>
            <Route path="contacts/new" element={<MemberFormPage />} />
            <Route path="contacts/:id/edit" element={<MemberFormPage />} />
          </Route>
          <Route path="contacts/:id" element={<MemberDetailPage />} />
          <Route path="programs/:id" element={<ProgramDetailPage />} />
          <Route path="*" element={<PlaceholderPage title="Page not found" description="The page you requested could not be found." />} />
        </Route>
      </Route>
    </Routes>
  );
}
