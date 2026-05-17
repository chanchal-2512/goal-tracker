// frontend/src/components/ProtectedRoute.jsx
// Wraps routes that need auth — redirects to /login if not logged in
// Also enforces role — redirects if wrong role tries to access a page

import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        Loading...
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (role && user.role !== role) {
    // Redirect to their own dashboard if they try to access another role's page
    if (user.role === 'admin') return <Navigate to="/admin" replace />;
    if (user.role === 'manager') return <Navigate to="/manager" replace />;
    return <Navigate to="/employee" replace />;
  }

  return children;
}
