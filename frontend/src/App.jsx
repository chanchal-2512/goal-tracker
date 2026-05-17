// frontend/src/App.jsx

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import Login          from './pages/Login';
import GoalSheet      from './pages/employee/GoalSheet';
import TeamGoals      from './pages/manager/TeamGoals';
import AdminDashboard from './pages/admin/Dashboard';
import Analytics      from './pages/admin/Analytics';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"    element={<Login />} />
          <Route path="/employee" element={<ProtectedRoute role="employee"><GoalSheet /></ProtectedRoute>} />
          <Route path="/manager"  element={<ProtectedRoute role="manager"><TeamGoals /></ProtectedRoute>} />
          <Route path="/admin"    element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
          <Route path="/admin/analytics" element={<ProtectedRoute role="admin"><Analytics /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
