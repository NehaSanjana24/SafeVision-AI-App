import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { NotificationProvider } from './context/NotificationContext';
import { AppLayout } from './components/layout/AppLayout';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { DetectionPage } from './pages/DetectionPage';
import { DashboardPage } from './pages/DashboardPage';
import { IntelligencePage } from './pages/IntelligencePage';
import { ReportsPage } from './pages/ReportsPage';
import { AlertsPage } from './pages/AlertsPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { AssistantPage } from './pages/AssistantPage';

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
              className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 font-semibold text-xs hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
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
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Routes>
              </BrowserRouter>
            </NotificationProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
