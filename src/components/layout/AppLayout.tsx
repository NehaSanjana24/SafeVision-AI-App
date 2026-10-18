import React, { useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';

export const AppLayout: React.FC = () => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(false);

  // Allow home page and login page publicly
  const isPublicRoute = location.pathname === '/' || location.pathname === '/login';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium tracking-wide">Initializing SafeVision AI Platform...</p>
      </div>
    );
  }

  // Redirect to login if user is not authenticated on a protected route
  if (!currentUser && !isPublicRoute) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If on login page, render full screen without sidebar
  if (location.pathname === '/login') {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
        <main className="flex-1 overflow-y-auto bg-slate-900/40 p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
