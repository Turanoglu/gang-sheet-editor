import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { EditorPage, AdminPanel } from './pages';
import './App.css';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace' }}>
          <h2 style={{ color: 'red' }}>Admin Panel Hatası</h2>
          <pre style={{ background: '#fee', padding: 16, borderRadius: 8, whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}{'\n'}{this.state.error.stack}
          </pre>
          <button onClick={() => { localStorage.removeItem('gang-sheet-admin-key'); window.location.reload(); }}
            style={{ marginTop: 16, padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Admin key temizle ve yenile
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const SHOPIFY_LOGIN_URL = 'https://www.inkdyno.com/account/login?return_url=%2Fpages%2Fgang-sheet-sample';

function ShopifyAuthGate({ children }: { children: React.ReactNode }) {
  const urlParams = new URLSearchParams(window.location.search);
  // Must come through Shopify iframe: 'shop' param is enough, customerId optional (login may come later)
  const isEmbedded = !!urlParams.get('shop');

  if (!isEmbedded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Mağazamıza Hoş Geldiniz</h2>
          <p className="text-gray-500 mb-6 text-sm">
            GangFlow editörünü kullanmak için Shopify mağazamızdan giriş yapmanız gerekmektedir.
          </p>
          <button
            onClick={() => { (window.top || window).location.href = SHOPIFY_LOGIN_URL; }}
            className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl transition-colors"
          >
            Mağazaya Git
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ShopifyAuthGate><EditorPage /></ShopifyAuthGate>} />
        <Route path="/admin" element={<ErrorBoundary><AdminPanel /></ErrorBoundary>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
