import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import SearchPage from './pages/SearchPage';
import ReportsPage from './pages/ReportsPage';
import DashboardPage from './pages/DashboardPage';

function App() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen bg-gray-50">
        <nav className="bg-primary-500 text-white py-5 px-10 shadow-md">
          <div className="flex justify-between items-center">
            <div className="flex flex-col gap-1">
              <h1 className="text-3xl font-bold tracking-wider">⚔️ SHIELD</h1>
              <p className="text-xs opacity-80">Agency User Search & Reporting System</p>
            </div>
            <ul className="flex gap-8">
              <li>
                <Link to="/" className="text-white font-medium transition hover:bg-black/10 px-3 py-2 rounded">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link to="/search" className="text-white font-medium transition hover:bg-black/10 px-3 py-2 rounded">
                  Search
                </Link>
              </li>
              <li>
                <Link to="/reports" className="text-white font-medium transition hover:bg-black/10 px-3 py-2 rounded">
                  Reports
                </Link>
              </li>
            </ul>
          </div>
        </nav>

        <main className="flex-1 py-10 px-5 max-w-7xl mx-auto w-full">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/reports" element={<ReportsPage />} />
          </Routes>
        </main>

        <footer className="bg-gray-800 text-white text-center py-5 mt-10">
          <p className="m-0 opacity-80">&copy; 2026 Shield Internal System. All rights reserved.</p>
        </footer>
      </div>
    </Router>
  );
}

export default App;
