import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

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
export const auth = getAuth(app);

export async function signInWithGoogle() {
  const result = await FirebaseAuthentication.signInWithGoogle({
    webClientId: '416408320429-al902om5ndeej9qn4ha3rvu42qe8g8dj.apps.googleusercontent.com',
  });
  const credential = GoogleAuthProvider.credential(result.credential?.idToken);
  return signInWithCredential(auth, credential);
}
