import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  TrendingDown, 
  TrendingUp, 
  Wallet, 
  ArrowLeft, 
  Trash2, 
  Edit2, 
  Filter,
  X,
  PieChart as PieChartIcon,
  List as ListIcon,
  Moon,
  Sun,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip,
  Legend
} from 'recharts';
import { cn } from './lib/utils';
import { api } from './services/api';

// --- Types & Constants ---

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
  'Food',
  'Transport',
  'Bills',
  'Shopping',
  'Entertainment',
  'Health',
  'Education',
  'Other',
  'Salary',
  'Investment'
];

const CATEGORY_COLORS: Record<string, string> = {
  Food: '#fb923c', // Amber
  Transport: '#60a5fa', // Blue
  Bills: '#fbbf24', // Yellow
  Shopping: '#f472b6', // Pink
  Entertainment: '#a78bfa', // Purple
  Health: '#2dd4bf', // Teal
  Education: '#6366f1', // Indigo
  Other: '#94a3b8', // Gray
  Salary: '#34d399', // Emerald
  Investment: '#fb923c', // Orange
  Income: '#22c55e', // Green
};


// --- Components ---

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

const Card = ({ children, className }: CardProps) => (
  <div className={cn(
    "backdrop-blur-xl rounded-[32px] p-6 border shadow-2xl transition-all duration-300",
    "bg-white/10 border-white/20 dark:bg-white/10 dark:border-white/20",
    "light:bg-white/70 light:border-white/60 light:text-zinc-900",
    "bg-white/40 border-zinc-200 dark:bg-white/10 dark:border-white/20", // Simplified light mode fallback
    className
  )}>
    {children}
  </div>
);

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [detailsTransaction, setDetailsTransaction] = useState<Transaction | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [view, setView] = useState<'list' | 'chart'>('list');

  // Form State
  const [formData, setFormData] = useState<Omit<Transaction, 'id'>>({
    amount: 0,
    category: 'Food',
    type: 'expense',
    date: new Date().toISOString().split('T')[0],
    note: ''
  });

  useEffect(() => {
    api.getTransactions()
      .then(setTransactions)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  // Dark Mode Support
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Derived State
  const totals = useMemo(() => {
    return transactions.reduce((acc, curr) => {
      if (curr.type === 'income') {
        acc.income += curr.amount;
        acc.balance += curr.amount;
      } else {
        acc.expenses += curr.amount;
        acc.balance -= curr.amount;
      }
      return acc;
    }, { balance: 0, income: 0, expenses: 0 });
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions
      .filter(t => filterCategory === 'All' || t.category === filterCategory)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, filterCategory]);

  const chartData = useMemo(() => {
    const expenseData = transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, curr) => {
        acc[curr.category] = (acc[curr.category] || 0) + curr.amount;
        return acc;
      }, {} as Record<string, number>);

    const totalIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const data = Object.entries(expenseData).map(([name, value]) => ({ name, value }));
    if (totalIncome > 0) data.unshift({ name: 'Income', value: totalIncome });
    return data;
  }, [transactions]);

  // Handlers
  const handleOpenModal = (transaction?: Transaction) => {
    if (transaction) {
      setEditingTransaction(transaction);
      setFormData({
        amount: transaction.amount,
        category: transaction.category,
        type: transaction.type,
        date: transaction.date,
        note: transaction.note
      });
    } else {
      setEditingTransaction(null);
      setFormData({
        amount: 0,
        category: 'Food',
        type: 'expense',
        date: new Date().toISOString().split('T')[0],
        note: ''
      });
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
        setTransactions(prev => [...prev, created]);
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePointerDown = (t: Transaction) => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setDetailsTransaction(t);
    }, 500);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleCardClick = (t: Transaction) => {
    if (!longPressTriggered.current) handleOpenModal(t);
  };

  const handleDelete = async (id: string) => {
    const snapshot = transactions;
    setTransactions(prev => prev.filter(t => t.id !== id));
    try {
      await api.deleteTransaction(id);
    } catch (err) {
      console.error('Failed to delete:', err);
      setTransactions(snapshot);
    }
  };

  return (
    <div className={cn(
      "min-h-screen font-sans selection:bg-indigo-500/30 overflow-hidden relative transition-colors duration-300",
      isDarkMode ? "bg-[#0a0c14] text-white" : "bg-zinc-50 text-zinc-900"
    )}>
      {/* Decorative Blobs */}
      <div className={cn(
        "fixed top-[-10%] left-[-10%] w-[60%] h-[40%] rounded-full blur-[120px] pointer-events-none transition-opacity duration-700",
        isDarkMode ? "bg-indigo-600/20 opacity-100" : "bg-indigo-400/10 opacity-60"
      )} />
      <div className={cn(
        "fixed bottom-[-10%] right-[-10%] w-[60%] h-[40%] rounded-full blur-[120px] pointer-events-none transition-opacity duration-700",
        isDarkMode ? "bg-teal-500/15 opacity-100" : "bg-teal-400/10 opacity-60"
      )} />

      <div className={cn(
        "max-w-md mx-auto min-h-screen relative shadow-2xl overflow-hidden border-x transition-colors duration-300",
        isDarkMode ? "bg-white/5 backdrop-blur-sm border-white/5" : "bg-white/40 backdrop-blur-md border-zinc-200"
      )}>
        
        {/* Header */}
        <header className="p-6 pb-2 z-10 relative">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/30">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className={cn("text-[10px] font-bold uppercase tracking-[0.2em]", isDarkMode ? "text-white/40" : "text-zinc-400")}>Budget Tracker</h1>
                <p className="text-lg font-bold tracking-tight">Overview</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={cn(
                  "p-2.5 rounded-xl transition-all border",
                  isDarkMode ? "bg-white/10 hover:bg-white/20 border-white/10" : "bg-zinc-100 hover:bg-zinc-200 border-zinc-200"
                )}
              >
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </div>

          {/* Balance Card */}
          <Card className={cn(
            "mb-6 p-8 relative overflow-hidden group",
            isDarkMode ? "bg-white/10 border-white/20" : "bg-white border-zinc-100 shadow-xl"
          )}>
            <p className={cn("text-xs font-medium uppercase tracking-[0.15em] mb-1", isDarkMode ? "text-indigo-200" : "text-indigo-600")}>Total Balance</p>
            <h2 className="text-5xl font-black tracking-tighter mb-6">
              ₱{totals.balance.toLocaleString()}
            </h2>
            
            <div className="flex gap-3">
              <div className="flex-1 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
                <p className={cn("text-[9px] uppercase font-bold tracking-wider mb-1", isDarkMode ? "text-emerald-300" : "text-emerald-700")}>Income</p>
                <p className={cn("text-lg font-bold", isDarkMode ? "text-emerald-400" : "text-emerald-600")}>+₱{totals.income.toLocaleString()}</p>
              </div>
              <div className="flex-1 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4">
                <p className={cn("text-[9px] uppercase font-bold tracking-wider mb-1", isDarkMode ? "text-rose-300" : "text-rose-700")}>Expenses</p>
                <p className={cn("text-lg font-bold", isDarkMode ? "text-rose-400" : "text-rose-600")}>-₱{totals.expenses.toLocaleString()}</p>
              </div>
            </div>
          </Card>
        </header>

        {/* View Switcher & Filter */}
        <div className="px-6 mb-4 flex gap-2 overflow-x-auto no-scrollbar py-2 z-10 relative cursor-grab active:cursor-grabbing">
           <button 
            onClick={() => setFilterCategory('All')}
            className={cn(
              "whitespace-nowrap px-4 py-2 rounded-xl text-xs font-semibold transition-all border",
              filterCategory === 'All' 
                ? (isDarkMode ? "bg-white text-black border-white shadow-lg" : "bg-zinc-900 text-white border-zinc-900 shadow-md") 
                : (isDarkMode ? "bg-white/10 text-white/60 border-white/10 hover:bg-white/20" : "bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200")
            )}
           >
            All
           </button>
           {CATEGORIES.map(cat => (
             <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={cn(
                "whitespace-nowrap px-4 py-2 rounded-xl text-xs font-semibold transition-all border",
                filterCategory === cat 
                  ? (isDarkMode ? "bg-white text-black border-white shadow-lg" : "bg-zinc-900 text-white border-zinc-900 shadow-md") 
                  : (isDarkMode ? "bg-white/10 text-white/60 border-white/10 hover:bg-white/20" : "bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200")
              )}
             >
               {cat}
             </button>
           ))}
        </div>

        {/* Main Content Area */}
        <main className="px-6 h-[calc(100vh-450px)] overflow-y-auto no-scrollbar pb-24 z-10 relative">
          <div className="flex justify-between items-center mb-5">
            <div className="flex flex-col gap-0.5">
              <h2 className={cn("text-sm font-bold uppercase tracking-[0.15em]", isDarkMode ? "text-white/40" : "text-zinc-400")}>
                {view === 'list' ? 'Transactions' : 'Analytics'}
              </h2>
            </div>
            <div className={cn(
              "flex gap-1.5 p-1.5 rounded-xl border",
              isDarkMode ? "bg-white/5 border-white/10" : "bg-zinc-100 border-zinc-200"
            )}>
               <button 
                onClick={() => setView('list')}
                className={cn("p-2 rounded-lg transition-all", 
                  view === 'list' 
                    ? (isDarkMode ? "bg-white/10 text-white" : "bg-white text-zinc-900 shadow-sm") 
                    : (isDarkMode ? "text-white/40 hover:text-white/60" : "text-zinc-400 hover:text-zinc-600")
                )}
               >
                 <ListIcon size={16} />
               </button>
               <button 
                onClick={() => setView('chart')}
                className={cn("p-2 rounded-lg transition-all", 
                  view === 'chart' 
                    ? (isDarkMode ? "bg-white/10 text-white" : "bg-white text-zinc-900 shadow-sm") 
                    : (isDarkMode ? "text-white/40 hover:text-white/60" : "text-zinc-400 hover:text-zinc-600")
                )}
               >
                 <PieChartIcon size={16} />
               </button>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {view === 'list' ? (
              <motion.div 
                key="list"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {isLoading ? (
                  <div className="text-center py-16">
                    <p className={cn("font-medium animate-pulse", isDarkMode ? "text-white/40" : "text-zinc-400")}>Loading...</p>
                  </div>
                ) : filteredTransactions.length === 0 ? (
                  <div className="text-center py-16">
                    <div className={cn(
                      "w-20 h-20 border rounded-full flex items-center justify-center mx-auto mb-6 opacity-40",
                      isDarkMode ? "bg-white/5 border-white/10" : "bg-zinc-100 border-zinc-200"
                    )}>
                      <Filter size={32} />
                    </div>
                    <p className={cn("font-medium", isDarkMode ? "text-white/40" : "text-zinc-400")}>Clear of clutter.</p>
                  </div>
                ) : (
                  filteredTransactions.map(t => (
                    <motion.div
                      layout
                      key={t.id}
                    >
                      <div
                        className={cn(
                          "p-5 flex items-center gap-4 border rounded-2xl transition-all active:scale-[0.98] cursor-pointer select-none",
                          isDarkMode
                            ? "bg-white/5 hover:bg-white/10 border-white/5 hover:border-white/20"
                            : "bg-white hover:bg-zinc-50 border-zinc-100 hover:border-zinc-200 shadow-sm"
                        )}
                        onPointerDown={() => handlePointerDown(t)}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                        onContextMenu={(e) => e.preventDefault()}
                        onClick={() => handleCardClick(t)}
                      >
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border border-white/10 shadow-lg"
                          style={{ backgroundColor: `${CATEGORY_COLORS[t.category]}20`, color: CATEGORY_COLORS[t.category] }}
                        >
                          {t.type === 'income' ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-1">
                            <h3 className="font-bold text-sm tracking-tight">{t.category}</h3>
                            <span className={cn(
                              "font-bold text-lg tracking-tight",
                              t.type === 'income' ? "text-emerald-500" : "text-rose-500"
                            )}>
                              {t.type === 'income' ? '+' : '-'}₱{t.amount.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <p className={cn("text-xs truncate pr-4", isDarkMode ? "text-white/40" : "text-zinc-400")}>{t.note || 'No note added'}</p>
                            <span className={cn("text-[10px] uppercase font-black tracking-widest", isDarkMode ? "text-white/30" : "text-zinc-300")}>{t.date}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="chart"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className={cn(
                  "h-80 w-full border rounded-[32px] p-4",
                  isDarkMode ? "bg-white/5 border-white/10" : "bg-white border-zinc-100 shadow-xl"
                )}
              >
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={95}
                        paddingAngle={8}
                        dataKey="value"
                        animationBegin={0}
                        animationDuration={1000}
                      >
                        {chartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={CATEGORY_COLORS[entry.name] || '#94a3b8'} 
                            stroke={isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}
                            strokeWidth={2}
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{ 
                          borderRadius: '24px', 
                          border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)', 
                          boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.5)',
                          backgroundColor: isDarkMode ? 'rgba(15, 15, 20, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                          backdropFilter: 'blur(10px)',
                          color: isDarkMode ? '#fff' : '#18181b'
                        }}
                        itemStyle={{ color: isDarkMode ? '#fff' : '#18181b' }}
                      />
                      <Legend 
                        verticalAlign="bottom" 
                        height={36} 
                        formatter={(value) => <span className={cn("text-[10px] font-bold uppercase tracking-widest ml-1", isDarkMode ? "text-white/60" : "text-zinc-500")}>{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className={cn("flex items-center justify-center h-full text-sm font-medium", isDarkMode ? "text-white/30" : "text-zinc-400")}>
                    No insights available yet.
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* FAB */}
        <button 
          onClick={() => handleOpenModal()}
          className="absolute bottom-10 right-8 w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center shadow-2xl shadow-indigo-600/40 hover:scale-105 active:scale-95 transition-all border border-indigo-400/30 ring-8 ring-indigo-600/5 group z-30"
        >
          <Plus size={32} className="text-white transition-transform group-hover:rotate-90" />
        </button>

        {/* Modal Sheet */}
        <AnimatePresence>
          {isModalOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsModalOpen(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-md z-40"
              />
              <motion.div 
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className={cn(
                  "absolute bottom-0 left-0 right-0 backdrop-blur-[40px] rounded-t-[48px] z-50 p-8 shadow-2xl border-t",
                  isDarkMode ? "bg-[#0f111a]/80 border-white/10" : "bg-white/95 border-zinc-200"
                )}
              >
                <div className={cn("w-12 h-1.5 rounded-full mx-auto mb-8", isDarkMode ? "bg-white/10" : "bg-zinc-200")} />
                <div className="flex justify-between items-center mb-10">
                  <h2 className={cn("text-2xl font-bold tracking-tight", isDarkMode ? "text-white" : "text-zinc-900")}>
                    {editingTransaction ? 'Amend Entry' : 'New Transaction'}
                  </h2>
                  <button onClick={() => setIsModalOpen(false)} className={cn("w-10 h-10 flex items-center justify-center rounded-full transition-colors", isDarkMode ? "bg-white/5 text-white/40 hover:text-white" : "bg-zinc-100 text-zinc-400 hover:text-zinc-600")}>
                    <X size={20} />
                  </button>
                </div>

                <form onSubmit={handleSave} className="space-y-8">
                  {/* Amount Input */}
                  <div className={cn("text-center py-8 rounded-[32px] border", isDarkMode ? "bg-white/5 border-white/5" : "bg-zinc-50 border-zinc-100")}>
                    <div className="inline-flex items-center space-x-1 group">
                      <span className={cn("text-3xl font-bold group-focus-within:text-indigo-400 transition-colors", isDarkMode ? "text-white/20" : "text-zinc-300")}>₱</span>
                      <input 
                        type="number"
                        required
                        value={formData.amount || ''}
                        onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                        className={cn(
                          "text-6xl font-black tracking-tighter w-48 bg-transparent outline-none text-center border-none ring-0 placeholder:text-zinc-300",
                          isDarkMode ? "text-white placeholder:text-white/10" : "text-zinc-900"
                        )}
                        placeholder="0.00"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-5">
                    {/* Type Toggle */}
                    <div className={cn("col-span-2 flex p-1.5 rounded-2xl border", isDarkMode ? "bg-white/5 border-white/5" : "bg-zinc-100 border-zinc-200")}>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, type: 'expense' })}
                        className={cn(
                          "flex-1 py-3.5 rounded-xl text-xs font-bold transition-all",
                          formData.type === 'expense' 
                            ? (isDarkMode ? "bg-white text-black shadow-lg" : "bg-zinc-900 text-white shadow-md") 
                            : (isDarkMode ? "text-white/40" : "text-zinc-400")
                        )}
                      >
                        EXPENSE
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, type: 'income' })}
                        className={cn(
                          "flex-1 py-3.5 rounded-xl text-xs font-bold transition-all",
                          formData.type === 'income' 
                            ? (isDarkMode ? "bg-white text-black shadow-lg" : "bg-zinc-900 text-white shadow-md") 
                            : (isDarkMode ? "text-white/40" : "text-zinc-400")
                        )}
                      >
                        INCOME
                      </button>
                    </div>

                    {/* Category Select */}
                    <div className="space-y-2">
                      <label className={cn("text-[10px] uppercase font-bold tracking-[0.2em] ml-1", isDarkMode ? "text-white/30" : "text-zinc-400")}>Category</label>
                      <div className="relative">
                        <select 
                          className={cn(
                            "w-full border rounded-2xl py-4 px-5 text-sm focus:ring-2 focus:ring-indigo-500 cursor-pointer appearance-none outline-none",
                            isDarkMode ? "bg-white/5 border-white/10 text-white" : "bg-white border-zinc-200 text-zinc-900"
                          )}
                          value={formData.category}
                          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        >
                          {CATEGORIES.map(cat => <option key={cat} value={cat} className={isDarkMode ? "bg-[#0f111a]" : "bg-white"}>{cat}</option>)}
                        </select>
                        <ChevronDown className={cn("absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none", isDarkMode ? "text-white/20" : "text-zinc-300")} size={16} />
                      </div>
                    </div>

                    {/* Date Input */}
                    <div className="space-y-2">
                       <label className={cn("text-[10px] uppercase font-bold tracking-[0.2em] ml-1", isDarkMode ? "text-white/30" : "text-zinc-400")}>Timeline</label>
                       <input 
                         type="date"
                         required
                         className={cn(
                           "w-full border rounded-2xl py-4 px-5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none",
                           isDarkMode ? "bg-white/5 border-white/10 text-white color-scheme-dark" : "bg-white border-zinc-200 text-zinc-900"
                         )}
                         value={formData.date}
                         onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                       />
                    </div>

                    {/* Note Input */}
                    <div className="col-span-2 space-y-2">
                       <label className={cn("text-[10px] uppercase font-bold tracking-[0.2em] ml-1", isDarkMode ? "text-white/30" : "text-zinc-400")}>Annotation</label>
                       <input 
                         type="text"
                         placeholder="Memorable detail..."
                         className={cn(
                           "w-full border rounded-2xl py-4 px-5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none",
                           isDarkMode ? "bg-white/5 border-white/10 text-white placeholder:text-white/20" : "bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-300"
                         )}
                         value={formData.note}
                         onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                       />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-black text-sm tracking-[0.1em] py-5 rounded-[24px] transition-all shadow-xl shadow-indigo-600/20 active:scale-[0.98] border border-white/10"
                  >
                    {isSaving ? 'SAVING...' : editingTransaction ? 'SAVE CHANGES' : 'CREATE ENTRY'}
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
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDetailsTransaction(null)}
                className="absolute inset-0 bg-black/60 backdrop-blur-md z-40"
              />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className={cn(
                  "absolute bottom-0 left-0 right-0 backdrop-blur-[40px] rounded-t-[48px] z-50 p-8 shadow-2xl border-t",
                  isDarkMode ? "bg-[#0f111a]/80 border-white/10" : "bg-white/95 border-zinc-200"
                )}
              >
                <div className={cn("w-12 h-1.5 rounded-full mx-auto mb-8", isDarkMode ? "bg-white/10" : "bg-zinc-200")} />

                {/* Icon + amount */}
                <div className="flex flex-col items-center mb-8">
                  <div
                    className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 border border-white/10 shadow-lg"
                    style={{ backgroundColor: `${CATEGORY_COLORS[detailsTransaction.category]}20`, color: CATEGORY_COLORS[detailsTransaction.category] }}
                  >
                    {detailsTransaction.type === 'income' ? <TrendingUp size={36} /> : <TrendingDown size={36} />}
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight mb-1">{detailsTransaction.category}</h2>
                  <span className={cn(
                    "text-4xl font-black tracking-tighter",
                    detailsTransaction.type === 'income' ? "text-emerald-500" : "text-rose-500"
                  )}>
                    {detailsTransaction.type === 'income' ? '+' : '-'}₱{detailsTransaction.amount.toLocaleString()}
                  </span>
                </div>

                {/* Detail rows */}
                <div className={cn("rounded-2xl p-5 space-y-4 mb-8 border", isDarkMode ? "bg-white/5 border-white/5" : "bg-zinc-50 border-zinc-100")}>
                  <div className="flex justify-between items-center">
                    <span className={cn("text-[10px] uppercase font-bold tracking-[0.15em]", isDarkMode ? "text-white/30" : "text-zinc-400")}>Type</span>
                    <span className={cn("text-sm font-bold capitalize", detailsTransaction.type === 'income' ? "text-emerald-500" : "text-rose-500")}>{detailsTransaction.type}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={cn("text-[10px] uppercase font-bold tracking-[0.15em]", isDarkMode ? "text-white/30" : "text-zinc-400")}>Date</span>
                    <span className="text-sm font-bold">{detailsTransaction.date}</span>
                  </div>
                  {detailsTransaction.note ? (
                    <div className="flex justify-between items-center">
                      <span className={cn("text-[10px] uppercase font-bold tracking-[0.15em]", isDarkMode ? "text-white/30" : "text-zinc-400")}>Note</span>
                      <span className={cn("text-sm font-semibold max-w-[60%] text-right", isDarkMode ? "text-white/80" : "text-zinc-700")}>{detailsTransaction.note}</span>
                    </div>
                  ) : null}
                </div>

                {/* Delete button */}
                <button
                  onClick={() => { handleDelete(detailsTransaction.id); setDetailsTransaction(null); }}
                  className="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-black text-sm tracking-[0.1em] py-5 rounded-[24px] transition-all border border-rose-500/20 active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} />
                  DELETE ENTRY
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  );
}
