import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';

interface ProtectedRouteProps {
  requiredRole?: 'admin';
}

export default function ProtectedRoute({ requiredRole }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-accent" role="status">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        <span className="sr-only">Checking your session...</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (profile && !profile.is_active) return <Navigate to="/login" replace />;
  if (requiredRole === 'admin' && profile?.role !== 'admin') return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
