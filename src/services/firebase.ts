import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBt03AYAbvjU2e1DFDfX5KxBl3HZV3yERQ',
  authDomain: 'budget-tracker-87402.firebaseapp.com',
  projectId: 'budget-tracker-87402',
  storageBucket: 'budget-tracker-87402.firebasestorage.app',
  messagingSenderId: '416408320429',
  appId: '1:416408320429:web:fe16c90ab03891ccecc924',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
