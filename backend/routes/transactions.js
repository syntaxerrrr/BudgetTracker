import { Router } from 'express';
import { initFirebase } from '../firebase.js';

const router = Router();
const COLLECTION = 'transactions';

router.get('/', async (req, res) => {
  try {
    const db = initFirebase();
    const snapshot = await db.collection(COLLECTION).orderBy('date', 'desc').get();
    const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const db = initFirebase();
    const { amount, category, type, date, note } = req.body;
    const docRef = await db.collection(COLLECTION).add({
      amount: Number(amount),
      category,
      type,
      date,
      note: note || '',
      createdAt: new Date().toISOString(),
    });
    const doc = await docRef.get();
    res.status(201).json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const db = initFirebase();
    const { id } = req.params;
    const { amount, category, type, date, note } = req.body;
    await db.collection(COLLECTION).doc(id).update({
      amount: Number(amount),
      category,
      type,
      date,
      note: note || '',
      updatedAt: new Date().toISOString(),
    });
    const doc = await db.collection(COLLECTION).doc(id).get();
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = initFirebase();
    const { id } = req.params;
    await db.collection(COLLECTION).doc(id).delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
