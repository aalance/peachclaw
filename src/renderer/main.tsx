import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './store';
import App from './App';
import ApprovalApp from './components/pet/ApprovalApp';
import PetApp from './components/pet/PetApp';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find the root element');
}

try {
  const params = new URLSearchParams(window.location.search);
  const isPetWindow = params.get('window') === 'pet';
  const isApprovalWindow = params.get('window') === 'approval';
  // The pet window must be fully transparent; the shared body/#root background
  // would otherwise paint an opaque fill behind the floating pet.
  if (isPetWindow) {
    document.documentElement.classList.add('pet-window-root');
  }
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <Provider store={store}>
        {isApprovalWindow ? <ApprovalApp /> : isPetWindow ? <PetApp /> : <App />}
      </Provider>
    </React.StrictMode>
  );
} catch (error) {
  console.error('Failed to render the app:', error);
}
