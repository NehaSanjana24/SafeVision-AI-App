import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { UserRole } from '../types';
import {
  HardHat,
  Lock,
  Mail,
  User,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, currentUser } = useAuth();
  const { addToast } = useToast();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [preferredRole, setPreferredRole] = useState<UserRole>('supervisor');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Destination after login
  const from = (location.state as any)?.from?.pathname || '/dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
        addToast('success', 'Logged in successfully', 'Welcome back to SafeVision AI');
      } else {
        await register(name, email, password, preferredRole);
        addToast('success', 'Account created', `Welcome ${name}!`);
      }
      navigate(from, { replace: true });
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication error');
      addToast('error', 'Authentication Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Quick fill demo user credentials
  const fillDemoCreds = (type: 'admin' | 'supervisor') => {
    if (type === 'admin') {
      setEmail('admin@safevision.ai');
      setPassword('admin123');
    } else {
      setEmail('supervisor@safevision.ai');
      setPassword('password');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 relative overflow-hidden">
      {/* Background radial gradient glow */}
      <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-amber-500/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-blue-500/10 blur-[150px] rounded-full pointer-events-none" />

      <div className="w-full max-w-4xl bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 backdrop-blur-xl">
        {/* Branded Side Panel (5 cols) */}
        <div className="md:col-span-5 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/40 p-8 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800 relative">
          <div>
            <div className="flex items-center gap-2.5 mb-8">
              <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/25">
                <HardHat className="w-6 h-6 text-slate-950" />
              </div>
              <div>
                <span className="font-extrabold text-xl text-white tracking-tight">SafeVision</span>
                <span className="ml-1 px-1.5 py-0.5 text-[10px] font-black rounded bg-amber-500 text-slate-950">AI</span>
              </div>
            </div>

            <h2 className="text-2xl font-bold text-white tracking-tight leading-snug">
              Workplace Safety &amp; PPE Intelligence
            </h2>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
              Industrial computer vision verifying helmets, high-vis vests, respirators, and protective gear in real time.
            </p>

            <div className="mt-8 space-y-3.5">
              <div className="flex items-center gap-2.5 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>OSHA 1926.100 &amp; 1910 PPE Compliance Rules</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Sub-second Detection via YOLOv8 / Gemini</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Live Video Frame Extraction &amp; Alerts</span>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800">
            <div className="flex items-center gap-2 text-[11px] font-mono text-amber-400/90">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Multi-Role Access: Admin &amp; Supervisor</span>
            </div>
          </div>
        </div>

        {/* Auth Form Card (7 cols) */}
        <div className="md:col-span-7 p-8 sm:p-10 flex flex-col justify-center">
          {/* Demo Auth notice pill */}
          <div className="flex items-center justify-between mb-6">
            <span className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-mono font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Demo Auth (Local Storage)
            </span>

            {/* Quick-fill preset buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fillDemoCreds('admin')}
                className="text-[11px] px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition-colors"
                title="Fill Admin credentials"
              >
                Demo Admin
              </button>
              <button
                type="button"
                onClick={() => fillDemoCreds('supervisor')}
                className="text-[11px] px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition-colors"
                title="Fill Supervisor credentials"
              >
                Supervisor
              </button>
            </div>
          </div>

          {/* Login / Sign Up Tabs */}
          <div className="flex border-b border-slate-800 mb-6">
            <button
              onClick={() => {
                setMode('login');
                setErrorMsg('');
              }}
              className={`pb-3 font-semibold text-sm transition-all relative ${
                mode === 'login' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
              {mode === 'login' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-full" />
              )}
            </button>
            <button
              onClick={() => {
                setMode('signup');
                setErrorMsg('');
              }}
              className={`ml-6 pb-3 font-semibold text-sm transition-all relative ${
                mode === 'signup' ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Create Account
              {mode === 'signup' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-full" />
              )}
            </button>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Work Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@safevision.ai"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Requested Role
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPreferredRole('supervisor')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      preferredRole === 'supervisor'
                        ? 'bg-blue-500/10 border-blue-500 text-blue-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold">Site Supervisor</div>
                    <div className="text-[10px] opacity-75 mt-0.5">Detect, review, &amp; report</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreferredRole('admin')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      preferredRole === 'admin'
                        ? 'bg-amber-500/10 border-amber-500 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold">Safety Admin</div>
                    <div className="text-[10px] opacity-75 mt-0.5">Full access &amp; deletion</div>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  * Note: The first registered user is automatically designated as Admin.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-slate-950/20 border-t-slate-950 rounded-full animate-spin" />
              ) : (
                <>
                  <span>{mode === 'login' ? 'Sign In to SafeVision' : 'Register Safety Officer'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick skip to home */}
          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/')}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              &larr; Back to Public Overview
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
