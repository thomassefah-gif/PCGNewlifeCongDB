import { Navigate, Outlet } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import type { UserRole } from '../types/auth';

interface ProtectedRouteProps {
  requiredRole?: 'admin';
  allowedRoles?: UserRole[];
  children?: ReactNode;
}

export default function ProtectedRoute({ requiredRole, allowedRoles, children }: ProtectedRouteProps) {
  const { user, profile, loading, role } = useAuth();

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
  if (allowedRoles && (!role || !allowedRoles.includes(role))) return <Navigate to="/dashboard" replace />;

  return children ?? <Outlet />;
}
