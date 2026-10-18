import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  ScanEye,
  LayoutDashboard,
  FileText,
  BellRing,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, setCollapsed }) => {
  const [alertsCount] = useState<number>(0);

  const navItems = [
    { to: '/', label: 'Home', icon: Home, exact: true },
    { to: '/detect', label: 'PPE Detection', icon: ScanEye },
    { to: '/dashboard', label: 'Command Center', icon: LayoutDashboard },
    { to: '/reports', label: 'Safety Reports', icon: FileText },
    { to: '/alerts', label: 'Alert History', icon: BellRing, badge: alertsCount },
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
            <span className="text-[11px] font-bold tracking-wider uppercase text-slate-300">
              Navigation
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors ml-auto"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `group relative flex items-center gap-3.5 px-3.5 py-3 rounded-xl font-medium text-sm transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-amber-500/20 to-amber-500/5 text-amber-400 border border-amber-500/30 shadow-lg shadow-amber-950/20'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110 ${
                      isActive ? 'text-amber-400' : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}

                  {/* Active bar pill */}
                  {isActive && (
                    <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-amber-500" />
                  )}

                  {/* Tooltip for collapsed mode */}
                  {collapsed && (
                    <div className="absolute left-full ml-3 px-2.5 py-1 bg-slate-900 text-slate-100 text-xs font-medium rounded-lg border border-slate-700 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-xl">
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
        <div className="m-3 p-4 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800/80">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-slate-200">OSHA Safety Shield</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Real-time computer vision actively monitoring worker PPE compliance.
          </p>
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Standard</span>
            <span className="text-amber-400 font-mono font-semibold">ANSI/ISEA Z89.1</span>
          </div>
        </div>
      ) : (
        <div className="m-3 flex justify-center">
          <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-amber-500 border border-slate-800">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      )}
    </aside>
  );
};
