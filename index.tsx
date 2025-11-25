import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/globals.css';
import App from './App';
import { debugFindNews, debugListAllNewsImages } from './services/newsCache';

// Expose debug functions to window for browser console access
declare global {
  interface Window {
    stanse: {
      debugFindNews: typeof debugFindNews;
      debugListAllNewsImages: typeof debugListAllNewsImages;
    };
  }
}

window.stanse = {
  debugFindNews,
  debugListAllNewsImages,
};

console.log('🔧 Stanse Debug: Use window.stanse.debugFindNews("keyword") or window.stanse.debugListAllNewsImages() in console');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);