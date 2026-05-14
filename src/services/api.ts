import { db } from './firebase';
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

const COLLECTION = 'transactions';

export const api = {
  async getTransactions(): Promise<Transaction[]> {
    const q = query(collection(db, COLLECTION), orderBy('date', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
  },

  async createTransaction(data: TransactionInput): Promise<Transaction> {
    const docRef = await addDoc(collection(db, COLLECTION), {
      ...data,
      createdAt: new Date().toISOString(),
    });
    return { id: docRef.id, ...data };
  },

  async updateTransaction(id: string, data: TransactionInput): Promise<Transaction> {
    await updateDoc(doc(db, COLLECTION, id), {
      ...data,
      updatedAt: new Date().toISOString(),
    });
    return { id, ...data };
  },

  async deleteTransaction(id: string): Promise<{ success: boolean }> {
    await deleteDoc(doc(db, COLLECTION, id));
    return { success: true };
  },
};
