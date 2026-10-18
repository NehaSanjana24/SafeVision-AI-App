import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { detector } from '../../services/detector';
import { HardHat, LogOut, Sun, Moon, ShieldCheck, Cpu, UserCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { CustomModelModal } from '../model/CustomModelModal';

export const Navbar: React.FC = () => {
  const { currentUser, logout, isAdmin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [engine, setEngine] = useState<string>(detector.getActiveEngine());
  const [showModelModal, setShowModelModal] = useState(false);

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
    <header className="sticky top-0 z-30 h-16 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between transition-colors">
      <div className="flex items-center gap-3">
        <div
          onClick={() => navigate('/')}
          className="cursor-pointer flex items-center gap-2.5 group"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform">
            <HardHat className="w-6 h-6 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                SafeVision
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-black rounded-md bg-amber-500 text-slate-950 tracking-wider">
                AI
              </span>
            </div>
            <p className="text-[10px] font-medium text-slate-400 tracking-wider uppercase -mt-0.5">
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
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 hover:bg-slate-850 hover:border-amber-500/50 border border-slate-700/80 text-xs font-mono transition-all group cursor-pointer"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <Cpu className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-400 transition-colors hidden sm:inline" />
          <span className="text-slate-300 font-medium">Engine:</span>
          <span className="text-amber-400 font-semibold">{engine}</span>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          aria-label="Toggle dark/light theme"
          className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
        </button>

        {/* User Profile & Logout */}
        {currentUser ? (
          <div className="flex items-center gap-3 pl-2 border-l border-slate-800">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-200 truncate max-w-[140px]">
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
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 text-xs font-medium transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-amber-500/20"
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
    </>
  );
};
