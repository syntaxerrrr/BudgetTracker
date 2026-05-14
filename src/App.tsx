import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Plus,
  TrendingDown,
  TrendingUp,
  Wallet,
  ArrowLeft,
  Trash2,
  Filter,
  X,
  PieChart as PieChartIcon,
  List as ListIcon,
  Moon,
  Sun,
  ChevronDown,
  LogOut,
  Scissors,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts';
import { cn } from './lib/utils';
import { api, scheduleApi, type Schedule } from './services/api';
import { auth, signInWithGoogle } from './services/firebase';
import {
  onAuthStateChanged,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';

type TransactionType = 'income' | 'expense';

interface Transaction {
  id: string;
  amount: number;
  category: string;
  type: TransactionType;
  date: string;
  note: string;
}

const CATEGORIES = [
  'Food', 'Transport', 'Bills', 'Shopping', 'Entertainment',
  'Health', 'Education', 'Loan', 'Other', 'Salary', 'Investment',
];

const CATEGORY_COLORS: Record<string, string> = {
  Food: '#fb923c',
  Transport: '#60a5fa',
  Bills: '#fbbf24',
  Shopping: '#f472b6',
  Entertainment: '#a78bfa',
  Health: '#2dd4bf',
  Education: '#6366f1',
  Loan: '#f87171',
  Other: '#94a3b8',
  Salary: '#34d399',
  Investment: '#fb923c',
  Income: '#22c55e',
};

const CATEGORY_EMOJI: Record<string, string> = {
  Food: '🍔', Transport: '🚗', Bills: '💡', Shopping: '🛍️',
  Entertainment: '🎬', Health: '❤️', Education: '📚', Loan: '💳',
  Other: '📦', Salary: '💰', Investment: '📈',
};

function relativeDate(dateStr: string): string {
  const today = new Date();
  const date = new Date(dateStr);
  const todayStr = today.toISOString().split('T')[0];
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  const yesterdayStr = yest.toISOString().split('T')[0];
  if (dateStr === todayStr) return 'Today';
  if (dateStr === yesterdayStr) return 'Yesterday';
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [detailsTransaction, setDetailsTransaction] = useState<Transaction | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const [isDarkMode, setIsDarkMode] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [view, setView] = useState<'list' | 'chart'>('list');

  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [scheduleScreen, setScheduleScreen] = useState<'loading' | 'prompt' | 'form' | 'manager' | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ category: 'Loan', amount: 0, dayOfMonth: 1, note: '' });
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const [formData, setFormData] = useState<Omit<Transaction, 'id'>>({
    amount: 0, category: 'Food', type: 'expense',
    date: new Date().toISOString().split('T')[0], note: '',
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!authUser) { setTransactions([]); setIsLoading(false); return; }
    setIsLoading(true);
    api.getTransactions().then(setTransactions).catch(console.error).finally(() => setIsLoading(false));
  }, [authUser]);

  useEffect(() => {
    if (!authUser) { setSchedules([]); setScheduleScreen(null); return; }
    setScheduleScreen('loading');
    const today = new Date().toISOString().split('T')[0];
    const todayDay = new Date().getDate();

    const run = async () => {
      const fetched = await scheduleApi.getAll();
      setSchedules(fetched);
      for (const s of fetched) {
        if (s.dayOfMonth === todayDay && s.lastProcessedDate !== today) {
          const tx = await api.createTransaction({
            amount: s.amount, category: s.category, type: 'expense',
            date: today, note: s.note || 'Auto deduction',
          });
          setTransactions(prev => [tx, ...prev]);
          await scheduleApi.markProcessed(s.id, today);
        }
      }
      if (fetched.length > 0) {
        setScheduleScreen('manager');
      } else if (!localStorage.getItem(`autoDeductionSeen_${authUser.uid}`)) {
        setScheduleScreen('prompt');
      } else {
        setScheduleScreen(null);
      }
    };
    run().catch((err) => { console.error(err); setScheduleScreen('prompt'); });
  }, [authUser]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  const totals = useMemo(() => transactions.reduce((acc, curr) => {
    if (curr.type === 'income') { acc.income += curr.amount; acc.balance += curr.amount; }
    else { acc.expenses += curr.amount; acc.balance -= curr.amount; }
    return acc;
  }, { balance: 0, income: 0, expenses: 0 }), [transactions]);

  const filteredTransactions = useMemo(() =>
    transactions
      .filter(t => filterCategory === 'All' || t.category === filterCategory)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [transactions, filterCategory]);

  const chartData = useMemo(() => {
    const expenseData = transactions.filter(t => t.type === 'expense')
      .reduce((acc, curr) => { acc[curr.category] = (acc[curr.category] || 0) + curr.amount; return acc; }, {} as Record<string, number>);
    const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const data = Object.entries(expenseData).map(([name, value]) => ({ name, value }));
    if (totalIncome > 0) data.unshift({ name: 'Income', value: totalIncome });
    return data;
  }, [transactions]);

  const handleOpenModal = (transaction?: Transaction) => {
    if (transaction) {
      setEditingTransaction(transaction);
      setFormData({ amount: transaction.amount, category: transaction.category, type: transaction.type, date: transaction.date, note: transaction.note });
    } else {
      setEditingTransaction(null);
      setFormData({ amount: 0, category: 'Food', type: 'expense', date: new Date().toISOString().split('T')[0], note: '' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.amount <= 0 || isSaving) return;
    setIsSaving(true);
    try {
      if (editingTransaction) {
        const updated = await api.updateTransaction(editingTransaction.id, formData);
        setTransactions(prev => prev.map(t => t.id === editingTransaction.id ? updated : t));
      } else {
        const created = await api.createTransaction(formData);
        setTransactions(prev => [created, ...prev]);
      }
      setIsModalOpen(false);
    } catch (err) { console.error(err); }
    finally { setIsSaving(false); }
  };

  const handlePointerDown = (t: Transaction) => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => { longPressTriggered.current = true; setDetailsTransaction(t); }, 500);
  };
  const handlePointerUp = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  const handleCardClick = (t: Transaction) => { if (!longPressTriggered.current) handleOpenModal(t); };

  const handleDelete = async (id: string) => {
    const snapshot = transactions;
    setTransactions(prev => prev.filter(t => t.id !== id));
    try { await api.deleteTransaction(id); }
    catch (err) { console.error(err); setTransactions(snapshot); }
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (scheduleForm.amount <= 0 || scheduleSaving) return;
    setScheduleSaving(true);
    try {
      const saved = await scheduleApi.create({ ...scheduleForm, lastProcessedDate: null });
      setSchedules(prev => [...prev, saved]);
      setScheduleScreen('manager');
      setScheduleForm({ category: 'Loan', amount: 0, dayOfMonth: 1, note: '' });
    } finally { setScheduleSaving(false); }
  };

  const handleDeleteSchedule = async (id: string) => {
    setSchedules(prev => prev.filter(s => s.id !== id));
    await scheduleApi.remove(id);
  };

  const dm = isDarkMode;
  const inputCls = cn('w-full border rounded-2xl py-4 px-5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all',
    dm ? 'bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-indigo-500/50'
       : 'bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-400');
  const screenBg = cn('min-h-screen font-sans flex flex-col p-6 relative overflow-hidden',
    dm ? 'bg-[#080a12] text-white' : 'bg-slate-50 text-zinc-900');

  // ── Loading ──────────────────────────────────────────────────────────────
  if (authLoading || scheduleScreen === 'loading') {
    return (
      <div className={cn('min-h-screen flex flex-col items-center justify-center gap-4', dm ? 'bg-[#080a12]' : 'bg-slate-50')}>
        <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-600/30 animate-pulse">
          <Wallet className="w-7 h-7 text-white" />
        </div>
        <p className={cn('text-sm font-semibold tracking-wide', dm ? 'text-white/30' : 'text-zinc-400')}>Loading…</p>
      </div>
    );
  }

  // ── Login ────────────────────────────────────────────────────────────────
  if (!authUser) {
    return (
      <div className={cn('min-h-screen font-sans flex flex-col items-center justify-center p-6 relative overflow-hidden', dm ? 'bg-[#080a12] text-white' : 'bg-slate-50 text-zinc-900')}>
        <div className="absolute top-[-20%] left-[-20%] w-[70%] h-[50%] rounded-full blur-[140px] pointer-events-none bg-indigo-600/25" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[70%] h-[50%] rounded-full blur-[140px] pointer-events-none bg-violet-600/20" />

        <div className="w-full max-w-sm relative z-10 flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-600/40 mb-6">
            <Wallet className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-black tracking-tight mb-2">Budget Tracker</h1>
          <p className={cn('text-sm mb-10', dm ? 'text-white/40' : 'text-zinc-400')}>Track your money, own your future.</p>

          <button
            type="button"
            disabled={authSubmitting}
            onClick={async () => {
              setAuthError('');
              setAuthSubmitting(true);
              try { await signInWithGoogle(); }
              catch { setAuthError('Sign-in failed. Try again.'); }
              finally { setAuthSubmitting(false); }
            }}
            className={cn(
              'w-full flex items-center justify-center gap-3 rounded-2xl py-4 px-5 text-sm font-bold transition-all active:scale-[0.97] border',
              dm ? 'bg-white text-zinc-900 border-white/10 hover:bg-zinc-100 shadow-xl'
                 : 'bg-white text-zinc-800 border-zinc-200 hover:bg-zinc-50 shadow-lg shadow-zinc-200/80'
            )}
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.4-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-3-11.3-7.3l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.4-2.5 4.4-4.6 5.8l6.2 5.2C40.8 35.5 44 30.1 44 24c0-1.3-.1-2.7-.4-4z"/>
            </svg>
            {authSubmitting ? 'Signing in…' : 'Continue with Google'}
          </button>
          {authError && <p className="text-rose-500 text-sm font-medium mt-4">{authError}</p>}
        </div>
      </div>
    );
  }

  const firstName = authUser.displayName?.split(' ')[0] ?? 'there';

  // ── Schedule: Prompt ─────────────────────────────────────────────────────
  if (scheduleScreen === 'prompt') {
    return (
      <div className={screenBg}>
        <div className="absolute top-[-20%] left-[-20%] w-[70%] h-[50%] rounded-full blur-[140px] pointer-events-none bg-indigo-600/20" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[70%] h-[50%] rounded-full blur-[140px] pointer-events-none bg-violet-600/15" />
        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full relative z-10">
          <div className="w-24 h-24 rounded-3xl flex items-center justify-center mb-8 text-5xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20">
            ✂️
          </div>
          <p className={cn('text-xs font-bold uppercase tracking-[0.2em] mb-2', dm ? 'text-indigo-400' : 'text-indigo-600')}>New Feature</p>
          <h1 className="text-3xl font-black tracking-tight mb-3">Auto Deduction</h1>
          <p className={cn('text-sm leading-relaxed mb-10', dm ? 'text-white/50' : 'text-zinc-500')}>
            Set recurring expenses that automatically get recorded on a specific date each month — loans, bills, subscriptions.
          </p>
          <button onClick={() => setScheduleScreen('form')} className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black text-sm tracking-[0.1em] py-5 rounded-2xl transition-all shadow-xl shadow-indigo-600/30 active:scale-[0.98] mb-3 hover:opacity-90">
            SET UP NOW
          </button>
          <button onClick={() => { localStorage.setItem(`autoDeductionSeen_${authUser.uid}`, 'true'); setScheduleScreen(null); }} className={cn('w-full font-semibold text-sm py-4 rounded-2xl transition-all', dm ? 'text-white/30 hover:text-white/60' : 'text-zinc-400 hover:text-zinc-600')}>
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  // ── Schedule: Form ───────────────────────────────────────────────────────
  if (scheduleScreen === 'form') {
    return (
      <div className={screenBg}>
        <div className="absolute top-[-20%] left-[-20%] w-[70%] h-[50%] rounded-full blur-[140px] pointer-events-none bg-indigo-600/20" />
        <div className="max-w-sm mx-auto w-full relative z-10 pt-2">
          <button onClick={() => setScheduleScreen(schedules.length > 0 ? 'manager' : 'prompt')} className={cn('flex items-center gap-2 text-sm font-semibold mb-8 transition-colors', dm ? 'text-white/40 hover:text-white' : 'text-zinc-400 hover:text-zinc-700')}>
            <ArrowLeft size={16} /> Back
          </button>
          <p className={cn('text-xs font-bold uppercase tracking-[0.2em] mb-1', dm ? 'text-indigo-400' : 'text-indigo-600')}>Schedule</p>
          <h1 className="text-3xl font-black tracking-tight mb-8">New Auto Deduction</h1>
          <form onSubmit={handleSaveSchedule} className="space-y-4">
            <div className={cn('text-center py-8 rounded-3xl border', dm ? 'bg-white/5 border-white/8' : 'bg-white border-zinc-100 shadow-sm')}>
              <div className="inline-flex items-center gap-1">
                <span className={cn('text-3xl font-bold', dm ? 'text-white/20' : 'text-zinc-300')}>₱</span>
                <input type="number" required value={scheduleForm.amount || ''} onChange={e => setScheduleForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} className={cn('text-6xl font-black tracking-tighter w-48 bg-transparent outline-none text-center', dm ? 'text-white' : 'text-zinc-900')} placeholder="0.00" autoFocus />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className={cn('text-[10px] uppercase font-bold tracking-[0.2em]', dm ? 'text-white/30' : 'text-zinc-400')}>Category</label>
                <div className="relative">
                  <select value={scheduleForm.category} onChange={e => setScheduleForm(f => ({ ...f, category: e.target.value }))} className={inputCls}>
                    {CATEGORIES.map(c => <option key={c} value={c} className={dm ? 'bg-[#0f1221]' : 'bg-white'}>{CATEGORY_EMOJI[c]} {c}</option>)}
                  </select>
                  <ChevronDown className={cn('absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none', dm ? 'text-white/20' : 'text-zinc-300')} size={16} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={cn('text-[10px] uppercase font-bold tracking-[0.2em]', dm ? 'text-white/30' : 'text-zinc-400')}>Day of Month</label>
                <input type="number" required min={1} max={31} value={scheduleForm.dayOfMonth} onChange={e => setScheduleForm(f => ({ ...f, dayOfMonth: parseInt(e.target.value) || 1 }))} className={inputCls} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className={cn('text-[10px] uppercase font-bold tracking-[0.2em]', dm ? 'text-white/30' : 'text-zinc-400')}>Note (optional)</label>
              <input type="text" placeholder="e.g. Monthly loan payment" value={scheduleForm.note} onChange={e => setScheduleForm(f => ({ ...f, note: e.target.value }))} className={inputCls} />
            </div>
            <button type="submit" disabled={scheduleSaving} className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-90 disabled:opacity-50 text-white font-black text-sm tracking-[0.1em] py-5 rounded-2xl transition-all shadow-xl shadow-indigo-600/25 active:scale-[0.98]">
              {scheduleSaving ? 'SAVING…' : 'SAVE AUTO DEDUCTION'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Schedule: Manager ────────────────────────────────────────────────────
  if (scheduleScreen === 'manager') {
    return (
      <div className={screenBg}>
        <div className="absolute top-[-20%] left-[-20%] w-[70%] h-[50%] rounded-full blur-[140px] pointer-events-none bg-indigo-600/20" />
        <div className="max-w-sm mx-auto w-full relative z-10 pt-2 flex flex-col min-h-[calc(100vh-48px)]">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className={cn('text-xs font-bold uppercase tracking-[0.2em] mb-1', dm ? 'text-indigo-400' : 'text-indigo-600')}>Recurring</p>
              <h1 className="text-3xl font-black tracking-tight">Auto Deductions</h1>
            </div>
            <button onClick={() => setScheduleScreen(null)} className={cn('px-5 py-2.5 rounded-xl text-sm font-bold border transition-all', dm ? 'bg-white/8 border-white/10 hover:bg-white/15 text-white' : 'bg-zinc-100 border-zinc-200 hover:bg-zinc-200 text-zinc-700')}>
              Done
            </button>
          </div>

          {schedules.length > 0 && (
            <p className={cn('text-sm mb-6', dm ? 'text-white/40' : 'text-zinc-400')}>
              These are automatically recorded on their due date.
            </p>
          )}

          <div className="space-y-3 flex-1 mt-4">
            {schedules.map(s => (
              <div key={s.id} className={cn('flex items-center gap-4 p-4 rounded-2xl border', dm ? 'bg-white/5 border-white/8' : 'bg-white border-zinc-100 shadow-sm')}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{ backgroundColor: `${CATEGORY_COLORS[s.category]}18` }}>
                  {CATEGORY_EMOJI[s.category] || '📦'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{s.category}</p>
                  <p className={cn('text-xs mt-0.5', dm ? 'text-white/40' : 'text-zinc-400')}>
                    ₱{s.amount.toLocaleString()} · Every {ordinal(s.dayOfMonth)}
                    {s.note ? ` · ${s.note}` : ''}
                  </p>
                </div>
                <button onClick={() => handleDeleteSchedule(s.id)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors shrink-0">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          <div className="pt-6 space-y-3">
            <button onClick={() => setScheduleScreen('form')} className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-90 text-white font-black text-sm tracking-[0.1em] py-5 rounded-2xl transition-all shadow-xl shadow-indigo-600/25 active:scale-[0.98] flex items-center justify-center gap-2">
              <Plus size={18} /> ADD NEW
            </button>
            <button onClick={() => setScheduleScreen(null)} className={cn('w-full font-semibold text-sm py-4 rounded-2xl transition-all', dm ? 'text-white/30 hover:text-white/60' : 'text-zinc-400 hover:text-zinc-600')}>
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main App ─────────────────────────────────────────────────────────────
  return (
    <div className={cn('min-h-screen font-sans overflow-hidden relative transition-colors duration-300', dm ? 'bg-[#080a12] text-white' : 'bg-slate-100 text-zinc-900')}>
      <div className="fixed top-[-15%] left-[-15%] w-[65%] h-[45%] rounded-full blur-[130px] pointer-events-none bg-indigo-600/15" />
      <div className="fixed bottom-[-15%] right-[-15%] w-[65%] h-[45%] rounded-full blur-[130px] pointer-events-none bg-violet-600/10" />

      <div className={cn('max-w-md mx-auto min-h-screen relative shadow-2xl overflow-hidden border-x transition-colors duration-300', dm ? 'bg-white/[0.03] border-white/[0.06]' : 'bg-white/60 backdrop-blur-md border-zinc-200/80')}>

        {/* Header */}
        <header className="p-5 pb-3 z-10 relative">
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center font-bold text-white text-sm shadow-lg shadow-indigo-600/30">
                {firstName[0].toUpperCase()}
              </div>
              <div>
                <p className={cn('text-[10px] font-bold uppercase tracking-[0.2em]', dm ? 'text-white/30' : 'text-zinc-400')}>Budget Tracker</p>
                <p className="text-base font-bold tracking-tight">Hi, {firstName} 👋</p>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => setScheduleScreen('manager')} className={cn('p-2.5 rounded-xl transition-all border relative', dm ? 'bg-white/8 hover:bg-white/15 border-white/10' : 'bg-white hover:bg-zinc-50 border-zinc-200 shadow-sm')} title="Auto deductions">
                <Scissors size={17} />
                {schedules.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">{schedules.length}</span>}
              </button>
              <button onClick={() => setIsDarkMode(!dm)} className={cn('p-2.5 rounded-xl transition-all border', dm ? 'bg-white/8 hover:bg-white/15 border-white/10' : 'bg-white hover:bg-zinc-50 border-zinc-200 shadow-sm')}>
                {dm ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <button onClick={() => signOut(auth)} className={cn('p-2.5 rounded-xl transition-all border', dm ? 'bg-white/8 hover:bg-white/15 border-white/10' : 'bg-white hover:bg-zinc-50 border-zinc-200 shadow-sm')} title="Sign out">
                <LogOut size={17} />
              </button>
            </div>
          </div>

          {/* Balance Card */}
          <div className="relative rounded-3xl p-6 mb-4 overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 shadow-2xl shadow-indigo-600/30">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 0%, transparent 60%)' }} />
            <div className="absolute top-4 right-4 w-24 h-24 rounded-full bg-white/5 blur-xl" />
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-200 mb-1">Total Balance</p>
            <h2 className="text-5xl font-black tracking-tighter text-white mb-5">
              ₱{totals.balance.toLocaleString()}
            </h2>
            <div className="flex gap-3">
              <div className="flex-1 bg-white/10 rounded-2xl p-3 backdrop-blur-sm border border-white/10">
                <p className="text-[9px] uppercase font-bold tracking-wider text-emerald-300 mb-1">Income</p>
                <p className="text-base font-bold text-white">+₱{totals.income.toLocaleString()}</p>
              </div>
              <div className="flex-1 bg-white/10 rounded-2xl p-3 backdrop-blur-sm border border-white/10">
                <p className="text-[9px] uppercase font-bold tracking-wider text-rose-300 mb-1">Expenses</p>
                <p className="text-base font-bold text-white">-₱{totals.expenses.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Category Filter */}
        <div className="px-5 mb-3 flex gap-2 overflow-x-auto no-scrollbar py-1">
          {['All', ...CATEGORIES].map(cat => (
            <button key={cat} onClick={() => setFilterCategory(cat)}
              className={cn('whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all border',
                filterCategory === cat
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                  : (dm ? 'bg-white/6 text-white/50 border-white/8 hover:bg-white/12' : 'bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50 shadow-sm')
              )}>
              {cat !== 'All' ? `${CATEGORY_EMOJI[cat]} ${cat}` : 'All'}
            </button>
          ))}
        </div>

        {/* Main Content */}
        <main className="px-5 h-[calc(100vh-430px)] overflow-y-auto no-scrollbar pb-24 z-10 relative">
          <div className="flex justify-between items-center mb-4">
            <h2 className={cn('text-xs font-bold uppercase tracking-[0.2em]', dm ? 'text-white/30' : 'text-zinc-400')}>
              {view === 'list' ? 'Transactions' : 'Analytics'}
            </h2>
            <div className={cn('flex gap-1 p-1 rounded-xl border', dm ? 'bg-white/5 border-white/8' : 'bg-zinc-100 border-zinc-200')}>
              <button onClick={() => setView('list')} className={cn('p-1.5 rounded-lg transition-all', view === 'list' ? (dm ? 'bg-white/15 text-white' : 'bg-white text-zinc-900 shadow-sm') : (dm ? 'text-white/30 hover:text-white/60' : 'text-zinc-400'))}>
                <ListIcon size={15} />
              </button>
              <button onClick={() => setView('chart')} className={cn('p-1.5 rounded-lg transition-all', view === 'chart' ? (dm ? 'bg-white/15 text-white' : 'bg-white text-zinc-900 shadow-sm') : (dm ? 'text-white/30 hover:text-white/60' : 'text-zinc-400'))}>
                <PieChartIcon size={15} />
              </button>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {view === 'list' ? (
              <motion.div key="list" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-2.5">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className={cn('w-10 h-10 rounded-xl animate-pulse', dm ? 'bg-white/10' : 'bg-zinc-200')} />
                    <p className={cn('text-sm font-medium', dm ? 'text-white/30' : 'text-zinc-400')}>Loading transactions…</p>
                  </div>
                ) : filteredTransactions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center', dm ? 'bg-white/5' : 'bg-zinc-100')}>
                      <Filter size={28} className={dm ? 'text-white/20' : 'text-zinc-300'} />
                    </div>
                    <p className={cn('text-sm font-semibold', dm ? 'text-white/30' : 'text-zinc-400')}>No transactions yet.</p>
                    <p className={cn('text-xs text-center', dm ? 'text-white/20' : 'text-zinc-300')}>Tap + to add your first entry</p>
                  </div>
                ) : (
                  filteredTransactions.map(t => (
                    <motion.div layout key={t.id}>
                      <div
                        className={cn('p-4 flex items-center gap-3.5 border rounded-2xl transition-all active:scale-[0.98] cursor-pointer select-none',
                          dm ? 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.06]' : 'bg-white hover:bg-zinc-50 border-zinc-100 shadow-sm')}
                        onPointerDown={() => handlePointerDown(t)} onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerUp} onPointerCancel={handlePointerUp}
                        onContextMenu={e => e.preventDefault()} onClick={() => handleCardClick(t)}
                      >
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{ backgroundColor: `${CATEGORY_COLORS[t.category]}18` }}>
                          {CATEGORY_EMOJI[t.category] || '📦'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-0.5">
                            <h3 className="font-bold text-sm">{t.category}</h3>
                            <span className={cn('font-black text-base tracking-tight', t.type === 'income' ? 'text-emerald-500' : 'text-rose-500')}>
                              {t.type === 'income' ? '+' : '-'}₱{t.amount.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <p className={cn('text-xs truncate pr-3', dm ? 'text-white/35' : 'text-zinc-400')}>{t.note || 'No note'}</p>
                            <span className={cn('text-[10px] font-bold shrink-0', dm ? 'text-white/25' : 'text-zinc-300')}>{relativeDate(t.date)}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </motion.div>
            ) : (
              <motion.div key="chart" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                className={cn('h-80 w-full border rounded-3xl p-4', dm ? 'bg-white/[0.04] border-white/8' : 'bg-white border-zinc-100 shadow-lg')}>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={chartData} cx="50%" cy="45%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value" animationBegin={0} animationDuration={800}>
                        {chartData.map((entry, i) => (
                          <Cell key={i} fill={CATEGORY_COLORS[entry.name] || '#94a3b8'} stroke="transparent" />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 40px -8px rgba(0,0,0,0.4)', backgroundColor: dm ? 'rgba(15,18,33,0.95)' : 'rgba(255,255,255,0.98)', color: dm ? '#fff' : '#18181b' }} itemStyle={{ color: dm ? '#fff' : '#18181b' }} />
                      <Legend verticalAlign="bottom" height={36} formatter={v => <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: dm ? 'rgba(255,255,255,0.5)' : '#71717a' }}>{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className={cn('flex flex-col items-center justify-center h-full gap-2', dm ? 'text-white/20' : 'text-zinc-300')}>
                    <PieChartIcon size={32} />
                    <p className="text-sm font-medium">No data yet</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* FAB */}
        <button onClick={() => handleOpenModal()}
          className="absolute bottom-8 right-6 w-14 h-14 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-600/40 hover:scale-105 active:scale-95 transition-all group z-30">
          <Plus size={26} className="text-white transition-transform group-hover:rotate-90 duration-200" />
        </button>

        {/* Add/Edit Sheet */}
        <AnimatePresence>
          {isModalOpen && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-black/50 backdrop-blur-sm z-40" />
              <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                className={cn('absolute bottom-0 left-0 right-0 rounded-t-[40px] z-50 p-7 shadow-2xl border-t', dm ? 'bg-[#0f1221]/95 border-white/8 backdrop-blur-2xl' : 'bg-white border-zinc-200')}>
                <div className={cn('w-10 h-1 rounded-full mx-auto mb-7', dm ? 'bg-white/15' : 'bg-zinc-200')} />
                <div className="flex justify-between items-center mb-7">
                  <h2 className="text-xl font-black tracking-tight">{editingTransaction ? 'Edit Transaction' : 'New Transaction'}</h2>
                  <button onClick={() => setIsModalOpen(false)} className={cn('w-9 h-9 flex items-center justify-center rounded-xl', dm ? 'bg-white/8 text-white/40 hover:text-white' : 'bg-zinc-100 text-zinc-400 hover:text-zinc-700')}>
                    <X size={18} />
                  </button>
                </div>
                <form onSubmit={handleSave} className="space-y-4">
                  <div className={cn('text-center py-7 rounded-2xl border', dm ? 'bg-white/[0.04] border-white/8' : 'bg-slate-50 border-zinc-100')}>
                    <div className="inline-flex items-center gap-1">
                      <span className={cn('text-2xl font-bold', dm ? 'text-white/20' : 'text-zinc-300')}>₱</span>
                      <input type="number" required value={formData.amount || ''} onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })} className={cn('text-5xl font-black tracking-tighter w-44 bg-transparent outline-none text-center', dm ? 'text-white' : 'text-zinc-900')} placeholder="0" autoFocus />
                    </div>
                  </div>
                  <div className={cn('flex p-1 rounded-xl border gap-1', dm ? 'bg-white/[0.04] border-white/8' : 'bg-zinc-100 border-zinc-200')}>
                    {(['expense', 'income'] as const).map(type => (
                      <button key={type} type="button" onClick={() => setFormData({ ...formData, type })}
                        className={cn('flex-1 py-3 rounded-lg text-xs font-black tracking-wide transition-all',
                          formData.type === type
                            ? type === 'expense' ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                            : (dm ? 'text-white/30' : 'text-zinc-400')
                        )}>
                        {type.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className={cn('text-[10px] uppercase font-bold tracking-[0.2em]', dm ? 'text-white/30' : 'text-zinc-400')}>Category</label>
                      <div className="relative">
                        <select className={cn(inputCls, 'appearance-none')} value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                          {CATEGORIES.map(cat => <option key={cat} value={cat} className={dm ? 'bg-[#0f1221]' : 'bg-white'}>{CATEGORY_EMOJI[cat]} {cat}</option>)}
                        </select>
                        <ChevronDown className={cn('absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none', dm ? 'text-white/20' : 'text-zinc-300')} size={15} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className={cn('text-[10px] uppercase font-bold tracking-[0.2em]', dm ? 'text-white/30' : 'text-zinc-400')}>Date</label>
                      <input type="date" required className={inputCls} value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className={cn('text-[10px] uppercase font-bold tracking-[0.2em]', dm ? 'text-white/30' : 'text-zinc-400')}>Note</label>
                    <input type="text" placeholder="Add a note…" className={inputCls} value={formData.note} onChange={e => setFormData({ ...formData, note: e.target.value })} />
                  </div>
                  <button type="submit" disabled={isSaving} className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-90 disabled:opacity-50 text-white font-black text-sm tracking-[0.1em] py-4 rounded-2xl transition-all shadow-xl shadow-indigo-600/25 active:scale-[0.98]">
                    {isSaving ? 'SAVING…' : editingTransaction ? 'SAVE CHANGES' : 'CREATE ENTRY'}
                  </button>
                </form>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Details Sheet */}
        <AnimatePresence>
          {detailsTransaction && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDetailsTransaction(null)} className="absolute inset-0 bg-black/50 backdrop-blur-sm z-40" />
              <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                className={cn('absolute bottom-0 left-0 right-0 rounded-t-[40px] z-50 p-7 shadow-2xl border-t', dm ? 'bg-[#0f1221]/95 border-white/8 backdrop-blur-2xl' : 'bg-white border-zinc-200')}>
                <div className={cn('w-10 h-1 rounded-full mx-auto mb-7', dm ? 'bg-white/15' : 'bg-zinc-200')} />
                <div className="flex flex-col items-center mb-7">
                  <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 text-4xl" style={{ backgroundColor: `${CATEGORY_COLORS[detailsTransaction.category]}18` }}>
                    {CATEGORY_EMOJI[detailsTransaction.category] || '📦'}
                  </div>
                  <h2 className="text-xl font-black mb-1">{detailsTransaction.category}</h2>
                  <span className={cn('text-4xl font-black tracking-tighter', detailsTransaction.type === 'income' ? 'text-emerald-500' : 'text-rose-500')}>
                    {detailsTransaction.type === 'income' ? '+' : '-'}₱{detailsTransaction.amount.toLocaleString()}
                  </span>
                </div>
                <div className={cn('rounded-2xl p-4 space-y-3 mb-5 border', dm ? 'bg-white/[0.04] border-white/8' : 'bg-zinc-50 border-zinc-100')}>
                  {[
                    { label: 'Type', value: <span className={cn('text-sm font-bold capitalize', detailsTransaction.type === 'income' ? 'text-emerald-500' : 'text-rose-500')}>{detailsTransaction.type}</span> },
                    { label: 'Date', value: <span className="text-sm font-bold">{detailsTransaction.date}</span> },
                    ...(detailsTransaction.note ? [{ label: 'Note', value: <span className={cn('text-sm font-semibold text-right max-w-[60%]', dm ? 'text-white/80' : 'text-zinc-700')}>{detailsTransaction.note}</span> }] : []),
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between items-center">
                      <span className={cn('text-[10px] uppercase font-bold tracking-[0.15em]', dm ? 'text-white/25' : 'text-zinc-400')}>{label}</span>
                      {value}
                    </div>
                  ))}
                </div>
                <button onClick={() => { handleDelete(detailsTransaction.id); setDetailsTransaction(null); }}
                  className="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-black text-sm tracking-[0.1em] py-4 rounded-2xl transition-all border border-rose-500/20 active:scale-[0.98] flex items-center justify-center gap-2">
                  <Trash2 size={15} /> DELETE ENTRY
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}` }} />
    </div>
  );
}
