import { db, auth } from './firebase';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  orderBy,
  query,
} from 'firebase/firestore';

export interface Transaction {
  id: string;
  amount: number;
  category: string;
  type: 'income' | 'expense';
  date: string;
  note: string;
}

export type TransactionInput = Omit<Transaction, 'id'>;

export interface Schedule {
  id: string;
  category: string;
  amount: number;
  dayOfMonth: number;
  note: string;
  lastProcessedDate: string | null;
}

export type ScheduleInput = Omit<Schedule, 'id'>;

function txCollection() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  return collection(db, 'users', uid, 'transactions');
}

function txDoc(id: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  return doc(db, 'users', uid, 'transactions', id);
}

function scheduleCollection() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  return collection(db, 'users', uid, 'schedules');
}

function scheduleDoc(id: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  return doc(db, 'users', uid, 'schedules', id);
}

export const api = {
  async getTransactions(): Promise<Transaction[]> {
    const q = query(txCollection(), orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
  },

  async createTransaction(data: TransactionInput): Promise<Transaction> {
    const docRef = await addDoc(txCollection(), {
      ...data,
      createdAt: new Date().toISOString(),
    });
    return { id: docRef.id, ...data };
  },

  async updateTransaction(id: string, data: TransactionInput): Promise<Transaction> {
    await updateDoc(txDoc(id), {
      ...data,
      updatedAt: new Date().toISOString(),
    });
    return { id, ...data };
  },

  async deleteTransaction(id: string): Promise<{ success: boolean }> {
    await deleteDoc(txDoc(id));
    return { success: true };
  },
};

export const scheduleApi = {
  async getAll(): Promise<Schedule[]> {
    const snapshot = await getDocs(scheduleCollection());
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Schedule));
  },

  async create(data: ScheduleInput): Promise<Schedule> {
    const ref = await addDoc(scheduleCollection(), data);
    return { id: ref.id, ...data };
  },

  async markProcessed(id: string, date: string): Promise<void> {
    await updateDoc(scheduleDoc(id), { lastProcessedDate: date });
  },

  async remove(id: string): Promise<void> {
    await deleteDoc(scheduleDoc(id));
  },
};
