import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { NotificationProvider } from './context/NotificationContext';
import { AppLayout } from './components/layout/AppLayout';

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const DetectionPage = lazy(() => import('./pages/DetectionPage').then((m) => ({ default: m.DetectionPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const IntelligencePage = lazy(() => import('./pages/IntelligencePage').then((m) => ({ default: m.IntelligencePage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const KnowledgePage = lazy(() => import('./pages/KnowledgePage').then((m) => ({ default: m.KnowledgePage })));
const AssistantPage = lazy(() => import('./pages/AssistantPage').then((m) => ({ default: m.AssistantPage })));
const AlertsPage = lazy(() => import('./pages/AlertsPage').then((m) => ({ default: m.AlertsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

const RouteFallback: React.FC = () => (
  <div className="min-h-[60vh] flex flex-col items-center justify-center text-slate-400">
    <div className="w-10 h-10 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-3" />
    <p className="text-xs font-medium tracking-wide">Loading workspace module...</p>
  </div>
);

// Standard Error Boundary with Copy Error Details & Diagnostics (PART 3.5)
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any; copied: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, copied: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error, copied: false };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('Unhandled app error:', error, errorInfo);
  }

  handleCopyDetails = () => {
    const details = `SafeVision AI Error Log:\nTime: ${new Date().toISOString()}\nMessage: ${
      this.state.error?.message || 'Unknown error'
    }\nStack: ${this.state.error?.stack || 'No stack trace available'}`;
    navigator.clipboard.writeText(details);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2500);
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
            <span className="text-2xl font-bold">!</span>
          </div>
          <h2 className="text-xl font-bold">Something went wrong</h2>
          <p className="text-xs text-slate-400 mt-2 max-w-md">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>

          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 transition-colors cursor-pointer"
            >
              Reload Application
            </button>
            <button
              onClick={this.handleCopyDetails}
              className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-cyan-400 font-semibold text-xs hover:text-amber-400 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {this.state.copied ? 'Copied Details!' : 'Copy Error Details'}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <NotificationProvider>
              <BrowserRouter>
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    {/* Layout wrapper handles route protection */}
                    <Route element={<AppLayout />}>
                      <Route path="/" element={<HomePage />} />
                      <Route path="/login" element={<LoginPage />} />
                      <Route path="/detect" element={<DetectionPage />} />
                      <Route path="/dashboard" element={<DashboardPage />} />
                      <Route path="/intelligence" element={<IntelligencePage />} />
                      <Route path="/reports" element={<ReportsPage />} />
                      <Route path="/knowledge" element={<KnowledgePage />} />
                      <Route path="/assistant" element={<AssistantPage />} />
                      <Route path="/alerts" element={<AlertsPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </NotificationProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
