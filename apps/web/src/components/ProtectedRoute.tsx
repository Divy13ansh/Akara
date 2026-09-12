import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authService } from '../services/api';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireOnboarding?: boolean;
}

export function ProtectedRoute({ children, requireOnboarding = true }: ProtectedRouteProps) {
  const location = useLocation();
  const user = authService.getCurrentUser();

  // Unauthenticated users must redirect to /login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If onboarding is required but not completed, redirect to /onboarding/class
  if (requireOnboarding && !user.onboarding_completed) {
    return <Navigate to="/onboarding/class" replace />;
  }

  return <>{children}</>;
}
