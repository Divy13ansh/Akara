import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authService } from '../services/api';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireOnboarding?: boolean;
}

export function ProtectedRoute({ children, requireOnboarding = true }: ProtectedRouteProps) {
  const location = useLocation();
  const [state, setState] = useState<{ checked: boolean; user: ReturnType<typeof authService.getCurrentUser> }>({
    checked: false,
    user: authService.getCurrentUser(),
  });

  useEffect(() => {
    let cancelled = false;
    if (!authService.getToken()) {
      setState({ checked: true, user: null });
      return;
    }
    authService.getProfile()
      .then((user) => { if (!cancelled) setState({ checked: true, user }); })
      .catch(() => { if (!cancelled) setState({ checked: true, user: authService.getCurrentUser() }); });
    return () => { cancelled = true; };
  }, []);

  if (!state.checked) {
    return <div className="min-h-screen bg-[#F6F4F0] flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-stone-300 border-t-[#6b1302] animate-spin" /></div>;
  }

  if (!authService.getToken() || !state.user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireOnboarding && !state.user.onboarding_completed) {
    return <Navigate to="/onboarding/class" replace />;
  }

  return <>{children}</>;
}
