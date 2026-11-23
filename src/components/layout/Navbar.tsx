import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { detector } from '../../services/detector';
import {
  HardHat,
  LogOut,
  Sun,
  Moon,
  ShieldCheck,
  Cpu,
  UserCheck,
  Bot,
  Bell,
  Activity,
  AlertTriangle,
  Info,
  CheckCircle2,
  ExternalLink,
  LifeBuoy,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAgentEngineBadge } from '../../utils/env';
import { CustomModelModal } from '../model/CustomModelModal';
import { SystemHealthModal } from '../settings/SystemHealthModal';
import { useNotifications } from '../../context/NotificationContext';

export const Navbar: React.FC = () => {
  const { currentUser, logout, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();
  const [engine, setEngine] = useState<string>(detector.getActiveEngine());
  const [showModelModal, setShowModelModal] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  const refreshEngine = () => {
    setEngine(detector.getActiveEngine());
  };

  useEffect(() => {
    refreshEngine();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
    <header className="sticky top-0 z-30 h-16 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between transition-colors">
      <div className="flex items-center gap-3">
        <div
          onClick={() => navigate('/')}
          className="cursor-pointer flex items-center gap-2.5 group"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-violet-600 to-rose-500 flex items-center justify-center shadow-lg shadow-violet-500/25 group-hover:scale-105 transition-transform">
            <HardHat className="w-6 h-6 text-yellow-200" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-blue-600 via-violet-600 to-rose-600 dark:from-cyan-300 dark:via-violet-400 dark:to-amber-300 bg-clip-text text-transparent">
                SafeVision
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-black rounded-md bg-gradient-to-r from-emerald-600 via-blue-600 to-violet-600 text-yellow-200 tracking-wider shadow-sm">
                AI
              </span>
            </div>
            <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 tracking-wider uppercase -mt-0.5">
              PPE Safety Sentinel
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        {/* Active Engine Badge (Click to configure best.pt) */}
        <button
          onClick={() => setShowModelModal(true)}
          title={`Active detection engine: ${engine}. Click to connect custom best.pt weights or configure endpoint.`}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 hover:bg-blue-500/15 hover:border-blue-500/50 border border-blue-500/30 text-xs font-mono transition-all group cursor-pointer"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <Cpu className="w-3.5 h-3.5 text-blue-400 group-hover:text-amber-400 transition-colors hidden sm:inline" />
          <span className="text-slate-300 font-medium">Engine:</span>
          <span className="text-blue-400 font-semibold">{engine}</span>
        </button>

        {/* Agent Runtime Engine Badge */}
        <div
          title="SafeVision Agent Engine"
          className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-xs font-mono"
        >
          <Bot className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-slate-300 font-medium">Agent:</span>
          <span className="text-emerald-400 font-semibold">{getAgentEngineBadge()}</span>
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          aria-label="Toggle dark/light theme"
          title={theme === 'dark' ? 'Switch to bright Light Mode' : 'Switch to Dark Mode'}
          className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-violet-400" />}
        </button>

        {/* In-App Notifications Bell (Milestone 4 Rule Threshold Alerts) */}
        <div className="relative">
          <button
            onClick={() => setShowNotifDropdown(!showNotifDropdown)}
            title="Safety Notifications & Automated Rule Alerts"
            className="relative p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-400 hover:text-amber-300 border border-slate-800 transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-yellow-200 font-bold text-[10px] flex items-center justify-center ring-2 ring-slate-950 animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Popover Dropdown */}
          {showNotifDropdown && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">
                    Safety Alerts & Rules
                  </span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      {unreadCount} new
                    </span>
                  )}
                </div>

                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllAsRead()}
                    className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60 custom-scrollbar">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    No safety rule alerts logged. System operating nominally.
                  </div>
                ) : (
                  notifications.map((notif) => {
                    const isCrit = notif.severity === 'critical';
                    const isWarn = notif.severity === 'warning';
                    return (
                      <div
                        key={notif.id}
                        onClick={() => {
                          markAsRead(notif.id);
                          if (notif.link) {
                            navigate(notif.link);
                            setShowNotifDropdown(false);
                          }
                        }}
                        className={`p-3.5 hover:bg-slate-800/50 transition-colors cursor-pointer flex gap-3 ${
                          !notif.read ? 'bg-slate-950/40' : 'opacity-75'
                        }`}
                      >
                        <div className="shrink-0 mt-0.5">
                          {isCrit ? (
                            <div className="w-6 h-6 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center">
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </div>
                          ) : isWarn ? (
                            <div className="w-6 h-6 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-400 flex items-center justify-center">
                              <Info className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold text-slate-200 truncate">
                              {notif.title}
                            </span>
                            {!notif.read && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                            {notif.body}
                          </p>
                          <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1.5 font-mono">
                            <span>{new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <span className="text-amber-400/80 hover:underline flex items-center gap-0.5">
                              View in Intelligence <ExternalLink className="w-2.5 h-2.5 inline" />
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-2 border-t border-slate-800 bg-slate-950/60 text-center">
                <button
                  onClick={() => {
                    navigate('/intelligence');
                    setShowNotifDropdown(false);
                  }}
                  className="w-full py-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
                >
                  Open Workplace Intelligence Dashboard →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* System Health / Diagnostic Center (Admin or Supervisor) */}
        <button
          onClick={() => setShowHealthModal(true)}
          title="System Health, Engine Diagnostics, and Retention Settings"
          className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-amber-400 border border-slate-800 transition-colors cursor-pointer"
        >
          <Activity className="w-4 h-4" />
        </button>

        {/* Report a Problem (mailto with diagnostics) */}
        <a
          href={`mailto:safety-support@safevision.ai?subject=SafeVision%20Issue%20Report&body=System%20Diagnostics%3A%0AEngine%3A%20${encodeURIComponent(
            engine
          )}%0AUser%3A%20${encodeURIComponent(currentUser?.email || 'guest')}%0APlatform%3A%20Browser%20SPA%0A%0APlease%20describe%20your%20issue%3A%0A`}
          title="Report a Problem / Request Support"
          className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors hidden sm:inline-flex"
        >
          <LifeBuoy className="w-4 h-4" />
        </a>

        {/* User Profile & Logout */}
        {currentUser ? (
          <div className="flex items-center gap-3 pl-2 border-l border-slate-800">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-semibold text-cyan-400 truncate max-w-[140px]">
                {currentUser.name}
              </span>
              <span className="text-[10px] flex items-center justify-end gap-1 text-slate-400">
                {isAdmin ? (
                  <span className="text-amber-400 font-bold flex items-center gap-0.5">
                    <ShieldCheck className="w-3 h-3 inline" /> Admin
                  </span>
                ) : (
                  <span className="text-blue-400 font-medium flex items-center gap-0.5">
                    <UserCheck className="w-3 h-3 inline" /> Supervisor
                  </span>
                )}
              </span>
            </div>

            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-amber-700 flex items-center justify-center font-bold text-xs text-slate-950">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>

            <button
              onClick={handleLogout}
              title="Sign out"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 text-xs font-medium transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-amber-500/20 cursor-pointer"
          >
            Sign In
          </button>
        )}
      </div>
    </header>

    <CustomModelModal
      isOpen={showModelModal}
      onClose={() => setShowModelModal(false)}
      onEngineChanged={refreshEngine}
    />

    <SystemHealthModal
      isOpen={showHealthModal}
      onClose={() => setShowHealthModal(false)}
    />
    </>
  );
};
