import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  ScanEye,
  LayoutDashboard,
  FileText,
  BellRing,
  BookOpen,
  Bot,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  BrainCircuit,
  Settings,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}

interface NavTheme {
  activeBg: string;
  activeText: string;
  activeIcon: string;
  idleIcon: string;
  barBg: string;
}

const NAV_THEMES: Record<string, NavTheme> = {
  indigo: {
    activeBg: 'bg-indigo-500/15 border-indigo-500/40 shadow-md shadow-indigo-500/10',
    activeText: 'text-indigo-400',
    activeIcon: 'text-indigo-400',
    idleIcon: 'text-indigo-400/75 group-hover:text-indigo-400',
    barBg: 'bg-indigo-500',
  },
  amber: {
    activeBg: 'bg-amber-500/15 border-amber-500/40 shadow-md shadow-amber-500/10',
    activeText: 'text-amber-400',
    activeIcon: 'text-amber-400',
    idleIcon: 'text-amber-400/75 group-hover:text-amber-400',
    barBg: 'bg-amber-500',
  },
  blue: {
    activeBg: 'bg-blue-500/15 border-blue-500/40 shadow-md shadow-blue-500/10',
    activeText: 'text-blue-400',
    activeIcon: 'text-blue-400',
    idleIcon: 'text-blue-400/75 group-hover:text-blue-400',
    barBg: 'bg-blue-500',
  },
  violet: {
    activeBg: 'bg-violet-500/15 border-violet-500/40 shadow-md shadow-violet-500/10',
    activeText: 'text-violet-400',
    activeIcon: 'text-violet-400',
    idleIcon: 'text-violet-400/75 group-hover:text-violet-400',
    barBg: 'bg-violet-500',
  },
  emerald: {
    activeBg: 'bg-emerald-500/15 border-emerald-500/40 shadow-md shadow-emerald-500/10',
    activeText: 'text-emerald-400',
    activeIcon: 'text-emerald-400',
    idleIcon: 'text-emerald-400/75 group-hover:text-emerald-400',
    barBg: 'bg-emerald-500',
  },
  cyan: {
    activeBg: 'bg-cyan-500/15 border-cyan-500/40 shadow-md shadow-cyan-500/10',
    activeText: 'text-cyan-400',
    activeIcon: 'text-cyan-400',
    idleIcon: 'text-cyan-400/75 group-hover:text-cyan-400',
    barBg: 'bg-cyan-500',
  },
  purple: {
    activeBg: 'bg-purple-500/15 border-purple-500/40 shadow-md shadow-purple-500/10',
    activeText: 'text-purple-400',
    activeIcon: 'text-purple-400',
    idleIcon: 'text-purple-400/75 group-hover:text-purple-400',
    barBg: 'bg-purple-500',
  },
  rose: {
    activeBg: 'bg-rose-500/15 border-rose-500/40 shadow-md shadow-rose-500/10',
    activeText: 'text-rose-400',
    activeIcon: 'text-rose-400',
    idleIcon: 'text-rose-400/75 group-hover:text-rose-400',
    barBg: 'bg-rose-500',
  },
  orange: {
    activeBg: 'bg-orange-500/15 border-orange-500/40 shadow-md shadow-orange-500/10',
    activeText: 'text-orange-400',
    activeIcon: 'text-orange-400',
    idleIcon: 'text-orange-400/75 group-hover:text-orange-400',
    barBg: 'bg-orange-500',
  },
};

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, setCollapsed }) => {
  const [alertsCount] = useState<number>(0);

  const navItems = [
    { to: '/', label: 'Home', icon: Home, exact: true, theme: 'indigo' },
    { to: '/detect', label: 'PPE Detection', icon: ScanEye, theme: 'amber' },
    { to: '/dashboard', label: 'Command Center', icon: LayoutDashboard, theme: 'blue' },
    { to: '/intelligence', label: 'Intelligence', icon: BrainCircuit, theme: 'violet' },
    { to: '/reports', label: 'Safety Reports', icon: FileText, theme: 'emerald' },
    { to: '/knowledge', label: 'Knowledge Base', icon: BookOpen, theme: 'cyan' },
    { to: '/assistant', label: 'Assistant', icon: Bot, theme: 'purple' },
    { to: '/alerts', label: 'Alert History', icon: BellRing, badge: alertsCount, theme: 'rose' },
    { to: '/settings', label: 'Settings', icon: Settings, theme: 'orange' },
  ];

  return (
    <aside
      className={`relative z-20 shrink-0 border-r border-slate-800 bg-slate-950/95 transition-all duration-300 flex flex-col justify-between ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Navigation Items */}
      <div className="py-6 px-3 space-y-1.5">
        <div className="px-3 pb-3 flex items-center justify-between">
          {!collapsed && (
            <span className="text-[11px] font-bold tracking-wider uppercase text-blue-400">
              Navigation
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-400 hover:text-amber-400 border border-slate-800 transition-colors ml-auto cursor-pointer"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const colorTheme = NAV_THEMES[item.theme] || NAV_THEMES.blue;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `group relative flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 border ${
                  isActive
                    ? `${colorTheme.activeBg} ${colorTheme.activeText}`
                    : `border-transparent ${colorTheme.idleIcon} hover:bg-slate-900/70 hover:border-slate-800`
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110 ${
                      isActive ? colorTheme.activeIcon : colorTheme.idleIcon
                    }`}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}

                  {/* Active bar indicator */}
                  {isActive && (
                    <div className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full ${colorTheme.barBg}`} />
                  )}

                  {/* Tooltip for collapsed mode */}
                  {collapsed && (
                    <div className={`absolute left-full ml-3 px-2.5 py-1 bg-slate-900 ${colorTheme.activeText} text-xs font-medium rounded-lg border border-slate-700 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-xl`}>
                      {item.label}
                    </div>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* Safety Status Banner at bottom of sidebar */}
      {!collapsed ? (
        <div className="m-3 p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-blue-500/10 to-violet-500/10 border border-emerald-500/25">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-emerald-400">OSHA Safety Shield</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Real-time computer vision actively monitoring worker PPE compliance.
          </p>
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Standard</span>
            <span className="text-blue-400 font-mono font-semibold">ANSI/ISEA Z89.1</span>
          </div>
        </div>
      ) : (
        <div className="m-3 flex justify-center">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      )}
    </aside>
  );
};
