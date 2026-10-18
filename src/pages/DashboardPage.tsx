import React, { useState, useEffect, useMemo } from 'react';
import { repository } from '../services/storage';
import { Scan, Violation } from '../types';
import { useToast } from '../context/ToastContext';
import confetti from 'canvas-confetti';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from 'recharts';
import {
  LayoutDashboard,
  ShieldCheck,
  ShieldAlert,
  ScanEye,
  TrendingUp,
  TrendingDown,
  Filter,
  Download,
  Calendar,
  Sparkles,
  Search,
  ArrowUpDown,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Database,
  Layers,
} from 'lucide-react';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#06b6d4', '#8b5cf6', '#ec4899'];

export const DashboardPage: React.FC = () => {
  const { addToast } = useToast();
  const [scans, setScans] = useState<Scan[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateRange, setDateRange] = useState<'7d' | '14d' | '30d' | 'all'>('30d');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<'all' | 'image' | 'video'>('all');
  const [violationTypeFilter, setViolationTypeFilter] = useState<string>('all');
  const [timeUnit, setTimeUnit] = useState<'daily' | 'weekly'>('daily');

  // Search & Pagination for recent scans table
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'createdAt' | 'compliancePct' | 'totalViolations'>('createdAt');
  const [sortAsc, setSortAsc] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const allScans = await repository.getAllScans();
      const allViolations = await repository.getAllViolations();
      setScans(allScans);
      setViolations(allViolations);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedData = async () => {
    setLoading(true);
    const res = await repository.seedSampleData();
    await loadData();
    addToast(
      'success',
      'Realistic Demo Data Loaded!',
      `Generated ${res.scansCount} scans and ${res.violationsCount} violations.`
    );
    try {
      confetti({ particleCount: 75, spread: 60, origin: { y: 0.7 } });
    } catch {
      // ignore
    }
  };

  // Filtered dataset
  const filteredScans = useMemo(() => {
    let list = [...scans];
    const now = new Date().getTime();

    // Date range filter
    if (dateRange !== 'all') {
      const days = dateRange === '7d' ? 7 : dateRange === '14d' ? 14 : 30;
      const cutoff = now - days * 24 * 3600 * 1000;
      list = list.filter((s) => new Date(s.createdAt).getTime() >= cutoff);
    }

    // Source type filter
    if (sourceTypeFilter !== 'all') {
      list = list.filter((s) => s.sourceType === sourceTypeFilter);
    }

    return list;
  }, [scans, dateRange, sourceTypeFilter]);

  const filteredViolations = useMemo(() => {
    const scanIds = new Set(filteredScans.map((s) => s.id));
    let list = violations.filter((v) => scanIds.has(v.scanId));

    if (violationTypeFilter !== 'all') {
      list = list.filter((v) => v.type.toLowerCase().includes(violationTypeFilter.toLowerCase()));
    }

    return list;
  }, [violations, filteredScans, violationTypeFilter]);

  // KPI Calculations
  const kpis = useMemo(() => {
    const totalScans = filteredScans.length;
    const activeViolations = filteredViolations.filter((v) => !v.isFalsePositive);
    const falsePositivesCount = filteredViolations.filter((v) => v.isFalsePositive).length;
    const totalViolations = activeViolations.length;
    const avgCompliance =
      totalScans > 0
        ? Math.round(filteredScans.reduce((acc, s) => acc + s.compliancePct, 0) / totalScans)
        : 100;

    // Find most common violation (active hazards)
    const counts: Record<string, number> = {};
    for (const v of activeViolations) {
      counts[v.type] = (counts[v.type] || 0) + 1;
    }
    let mostCommon = 'None';
    let maxCount = 0;
    for (const [type, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = type;
      }
    }

    return {
      totalScans,
      totalViolations,
      falsePositivesCount,
      avgCompliance,
      mostCommon,
      mostCommonCount: maxCount,
    };
  }, [filteredScans, filteredViolations]);

  // Chart Data: Violations Over Time (Daily / Weekly)
  const timeSeriesData = useMemo(() => {
    const map = new Map<string, { date: string; violations: number; compliance: number; count: number }>();

    filteredScans.forEach((scan) => {
      const d = new Date(scan.createdAt);
      let key = '';
      if (timeUnit === 'weekly') {
        const weekNum = Math.ceil(d.getDate() / 7);
        key = `${d.toLocaleString('default', { month: 'short' })} W${weekNum}`;
      } else {
        key = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }

      const existing = map.get(key) || { date: key, violations: 0, compliance: 0, count: 0 };
      existing.violations += scan.totalViolations;
      existing.compliance += scan.compliancePct;
      existing.count += 1;
      map.set(key, existing);
    });

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        complianceRate: Math.round(item.compliance / item.count),
      }))
      .slice(-14);
  }, [filteredScans, timeUnit]);

  // Chart Data: Violation Type Distribution (Donut)
  const donutData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredViolations.forEach((v) => {
      counts[v.type] = (counts[v.type] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredViolations]);

  // Chart Data: Violations by Day of Week & Source Type
  const dayOfWeekData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const data = days.map((day) => ({ day, image: 0, video: 0 }));

    filteredViolations.forEach((v) => {
      const dayIndex = new Date(v.createdAt).getDay();
      if (v.sourceType === 'video') {
        data[dayIndex].video += 1;
      } else {
        data[dayIndex].image += 1;
      }
    });
    return data;
  }, [filteredViolations]);

  // Chart Data: Hour vs Day Risk Heatmap Grid
  const heatmapData = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const hours = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'];
    const grid: Record<string, number> = {};

    filteredViolations.forEach((v) => {
      const date = new Date(v.createdAt);
      const dayName = date.toLocaleDateString(undefined, { weekday: 'short' });
      const h = date.getHours();
      // Bucket into closest 2-hour bracket
      const bucket =
        h < 9 ? '08:00' : h < 11 ? '10:00' : h < 13 ? '12:00' : h < 15 ? '14:00' : h < 17 ? '16:00' : '18:00';
      const key = `${dayName}_${bucket}`;
      grid[key] = (grid[key] || 0) + 1;
    });

    return { days, hours, grid };
  }, [filteredViolations]);

  // Search & Filtered Table List
  const tableData = useMemo(() => {
    let list = filteredScans.filter((s) => {
      const query = searchQuery.toLowerCase();
      return (
        s.fileName.toLowerCase().includes(query) ||
        s.detectedClasses.some((c) => c.toLowerCase().includes(query))
      );
    });

    list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (typeof valA === 'string') {
        return sortAsc
          ? (valA as string).localeCompare(valB as string)
          : (valB as string).localeCompare(valA as string);
      }
      return sortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });

    return list;
  }, [filteredScans, searchQuery, sortField, sortAsc]);

  const totalPages = Math.ceil(tableData.length / itemsPerPage) || 1;
  const paginatedData = tableData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Export CSV of recent scans
  const handleExportCSV = () => {
    if (tableData.length === 0) return;
    const headers = ['Scan ID', 'File Name', 'Source Type', 'Total Persons', 'Total Violations', 'Compliance %', 'Created At'];
    const rows = tableData.map((s) => [
      s.id,
      `"${s.fileName}"`,
      s.sourceType,
      s.totalPersons,
      s.totalViolations,
      s.compliancePct,
      `"${new Date(s.createdAt).toLocaleString()}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SafeVision_PPE_Scans_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast('success', 'CSV Exported', 'Telemetry scan records downloaded.');
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <LayoutDashboard className="w-6 h-6 text-amber-400" />
            <span>Safety Command Center</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time workplace hazard surveillance telemetry, OSHA compliance metrics, and risk distributions.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadData}
            title="Refresh analytics data"
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs shadow-lg">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400 flex items-center gap-1 font-semibold pl-1">
            <Filter className="w-3.5 h-3.5 text-amber-400" /> Filters:
          </span>

          {/* Date Range */}
          <div className="flex bg-slate-950 rounded-lg p-0.5 border border-slate-800">
            {(['7d', '14d', '30d', 'all'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-2.5 py-1 rounded-md font-mono font-medium transition-all ${
                  dateRange === r ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Source Type Filter */}
          <select
            value={sourceTypeFilter}
            onChange={(e) => setSourceTypeFilter(e.target.value as any)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="all">All Sources</option>
            <option value="image">Image Only</option>
            <option value="video">Video Only</option>
          </select>

          {/* Violation Type Filter */}
          <select
            value={violationTypeFilter}
            onChange={(e) => setViolationTypeFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-amber-500"
          >
            <option value="all">All Violation Types</option>
            <option value="helmet">Helmet / Hardhat</option>
            <option value="vest">High-Vis Vest</option>
            <option value="glove">Gloves</option>
            <option value="goggle">Goggles</option>
            <option value="mask">Mask / Respirator</option>
          </select>
        </div>

        {/* Time Unit Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-[11px]">Trend Grouping:</span>
          <div className="flex bg-slate-950 rounded-lg p-0.5 border border-slate-800">
            <button
              onClick={() => setTimeUnit('daily')}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                timeUnit === 'daily' ? 'bg-slate-800 text-amber-400 font-bold' : 'text-slate-400'
              }`}
            >
              Daily
            </button>
            <button
              onClick={() => setTimeUnit('weekly')}
              className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                timeUnit === 'weekly' ? 'bg-slate-800 text-amber-400 font-bold' : 'text-slate-400'
              }`}
            >
              Weekly
            </button>
          </div>
        </div>
      </div>

      {/* Empty State Banner if no scans exist */}
      {scans.length === 0 && !loading && (
        <div className="p-8 rounded-3xl bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/30 text-center space-y-3">
          <Database className="w-12 h-12 text-amber-400 mx-auto opacity-80" />
          <h3 className="text-lg font-bold text-white">No Detection Records Found Yet</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            You haven&apos;t run any safety scans yet. Click below to load realistic sample enterprise surveillance
            records to preview charts and metrics immediately!
          </p>
          <button
            onClick={handleSeedData}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-xs shadow-lg shadow-amber-500/20 inline-flex items-center gap-2 transition-all hover:scale-105"
          >
            <Sparkles className="w-4 h-4" />
            <span>Load Sample Data</span>
          </button>
        </div>
      )}

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Scans */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Scans</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <ScanEye className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-white">{kpis.totalScans}</span>
            <span className="text-xs text-emerald-400 flex items-center font-medium">
              <TrendingUp className="w-3 h-3 mr-0.5" /> +12% vs last mo
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Industrial surveillance runs</div>
        </div>

        {/* Total Violations */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Violations Caught</span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-rose-400">{kpis.totalViolations}</span>
            {kpis.falsePositivesCount > 0 ? (
              <span className="text-xs text-purple-400 flex items-center font-medium font-mono">
                {kpis.falsePositivesCount} FP Calibrated
              </span>
            ) : (
              <span className="text-xs text-rose-400 flex items-center font-medium">
                <TrendingDown className="w-3 h-3 mr-0.5" /> Action required
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Active unmitigated hazard flags
          </div>
        </div>

        {/* Compliance % */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Compliance Score</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-emerald-400">{kpis.avgCompliance}%</span>
            <span className="text-xs text-emerald-400 flex items-center font-medium">
              <TrendingUp className="w-3 h-3 mr-0.5" /> +4.2%
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Target threshold: 90%</div>
        </div>

        {/* Most Common Violation */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Frequent Hazard</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-xl font-black text-amber-400 truncate block">
              {kpis.mostCommon}
            </span>
            <span className="text-xs text-slate-400">
              {kpis.mostCommonCount} occurrences recorded
            </span>
          </div>
          <div className="text-[11px] text-amber-400/80 mt-1">Priority for safety drill</div>
        </div>
      </div>

      {/* Row 1 Charts: Line Chart (Violations Over Time) & Area Chart (Compliance Trend) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Line Chart: Violations Over Time (7 cols) */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Violations Over Time</h3>
              <p className="text-[11px] text-slate-400">Daily frequency of non-compliance events</p>
            </div>
            <span className="text-xs font-mono text-rose-400 font-bold">
              {kpis.totalViolations} Total Flags
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeSeriesData}>
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.75rem',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="violations"
                  stroke="#ef4444"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#ef4444' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Area Chart: Compliance % Trend (5 cols) */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Compliance Trajectory (%)</h3>
              <p className="text-[11px] text-slate-400">Overall site adherence percentage</p>
            </div>
            <span className="text-xs font-mono text-emerald-400 font-bold">
              Avg {kpis.avgCompliance}%
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeriesData}>
                <defs>
                  <linearGradient id="complianceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" domain={[0, 100]} fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.75rem',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="complianceRate"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#complianceGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2 Charts: Donut (Distribution), Bar (Day of week), Radial Gauge */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">
        {/* Donut Chart: Violation Type Distribution (4 cols) */}
        <div className="lg:col-span-4 p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-3">
          <h3 className="text-sm font-bold text-white">Violation Distribution</h3>
          <p className="text-[11px] text-slate-400">Breakdown by non-compliant PPE category</p>

          <div className="h-56 w-full">
            {donutData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '0.75rem',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No violation records
              </div>
            )}
          </div>
        </div>

        {/* Bar Chart: Violations by Day of Week & Source (5 cols) */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-3">
          <h3 className="text-sm font-bold text-white">Violations by Day &amp; Source</h3>
          <p className="text-[11px] text-slate-400">Image uploads vs Continuous video extraction</p>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dayOfWeekData}>
                <XAxis dataKey="day" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.75rem',
                    color: '#f8fafc',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                <Bar dataKey="image" fill="#f59e0b" name="Image Scan" radius={[4, 4, 0, 0]} />
                <Bar dataKey="video" fill="#06b6d4" name="Video Frame" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Radial Gauge: Current Compliance Score (3 cols) */}
        <div className="lg:col-span-3 p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Compliance Gauge</h3>
            <p className="text-[11px] text-slate-400">Safety readiness rating</p>
          </div>

          <div className="h-44 w-full relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="65%"
                outerRadius="95%"
                barSize={12}
                data={[{ name: 'Score', value: kpis.avgCompliance, fill: '#10b981' }]}
                startAngle={210}
                endAngle={-30}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar background dataKey="value" cornerRadius={8} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
              <span className="text-2xl font-black font-mono text-emerald-400">
                {kpis.avgCompliance}%
              </span>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                SAFE
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex justify-between">
            <span>Risk Level:</span>
            <span
              className={`font-semibold ${
                kpis.avgCompliance > 85
                  ? 'text-emerald-400'
                  : kpis.avgCompliance > 70
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {kpis.avgCompliance > 85 ? 'Low (Nominal)' : kpis.avgCompliance > 70 ? 'Moderate' : 'Critical'}
            </span>
          </div>
        </div>
      </div>

      {/* Row 3: Heatmap-style Grid (Violations by Hour vs Day) */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Hazard Density Matrix (Hour vs Weekday)</h3>
            <p className="text-[11px] text-slate-400">
              Identifies peak non-compliance shift hours to schedule safety warden walks
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
            <span>Low</span>
            <span className="w-3 h-3 rounded bg-slate-800" />
            <span className="w-3 h-3 rounded bg-amber-500/40" />
            <span className="w-3 h-3 rounded bg-rose-500/80" />
            <span>High Risk</span>
          </div>
        </div>

        <div className="overflow-x-auto pt-2">
          <div className="min-w-[500px] grid grid-cols-7 gap-2">
            <div className="text-xs font-semibold text-slate-400 py-1">Time \ Day</div>
            {heatmapData.days.map((d) => (
              <div key={d} className="text-xs font-semibold text-slate-300 text-center py-1">
                {d}
              </div>
            ))}

            {heatmapData.hours.map((hr) => (
              <React.Fragment key={hr}>
                <div className="text-xs font-mono text-slate-400 py-2">{hr}</div>
                {heatmapData.days.map((day) => {
                  const key = `${day}_${hr}`;
                  const count = heatmapData.grid[key] || 0;
                  const bgClass =
                    count === 0
                      ? 'bg-slate-950/60 border-slate-800/80 text-slate-600'
                      : count <= 2
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 font-bold'
                      : 'bg-rose-500/30 border-rose-500/60 text-rose-200 font-bold shadow-lg shadow-rose-950/40';

                  return (
                    <div
                      key={key}
                      title={`${day} at ${hr}: ${count} violation(s)`}
                      className={`p-2 rounded-xl border text-center text-xs transition-transform hover:scale-105 flex items-center justify-center ${bgClass}`}
                    >
                      {count > 0 ? count : '-'}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Row 4: Recent Detections Table with Search, Sort, Pagination & CSV Export */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">Recent Safety Scans Audit</h3>
            <p className="text-[11px] text-slate-400">
              Showing {tableData.length} records matching current criteria
            </p>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by file or equipment..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 w-full sm:w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase">
                <th
                  onClick={() => {
                    setSortField('createdAt');
                    setSortAsc(!sortAsc);
                  }}
                  className="pb-2.5 cursor-pointer hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    <span>Date &amp; Time</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="pb-2.5">File Name</th>
                <th className="pb-2.5">Source</th>
                <th className="pb-2.5">Detected Equipment</th>
                <th
                  onClick={() => {
                    setSortField('totalViolations');
                    setSortAsc(!sortAsc);
                  }}
                  className="pb-2.5 cursor-pointer hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    <span>Violations</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => {
                    setSortField('compliancePct');
                    setSortAsc(!sortAsc);
                  }}
                  className="pb-2.5 cursor-pointer hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    <span>Compliance</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500">
                    No matching scan telemetry records found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((scan) => (
                  <tr key={scan.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 font-mono text-slate-400 whitespace-nowrap">
                      {new Date(scan.createdAt).toLocaleDateString()}{' '}
                      <span className="text-[10px] text-slate-500">
                        {new Date(scan.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="py-3 font-semibold text-slate-200">{scan.fileName}</td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded-full font-mono text-[10px] uppercase font-bold bg-slate-800 text-slate-300">
                        {scan.sourceType}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {scan.detectedClasses.map((cls) => (
                          <span
                            key={cls}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                              cls.toLowerCase().startsWith('no-')
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {cls}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3">
                      {scan.totalViolations > 0 ? (
                        <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-bold font-mono">
                          {scan.totalViolations} Hazard(s)
                        </span>
                      ) : (
                        <span className="text-emerald-400 font-bold flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" /> 0 (Clean)
                        </span>
                      )}
                    </td>
                    <td className="py-3 font-mono font-bold">
                      <span
                        className={
                          scan.compliancePct >= 90
                            ? 'text-emerald-400'
                            : scan.compliancePct >= 70
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }
                      >
                        {scan.compliancePct}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
            <span className="text-slate-400">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
