import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate, Route, Routes, Outlet, useLocation } from 'react-router-dom';
import { bootstrapAuth } from '../features/auth/authSlice.js';
import { FullPageSpinner } from '../components/ui.jsx';
import Toasts from '../components/Toasts.jsx';
import { isStaff } from '../utils/roles.js';
import AppLayout from './AppLayout.jsx';
import LoginPage from '../features/auth/LoginPage.jsx';
import RegisterPage from '../features/auth/RegisterPage.jsx';
import PosPage from '../features/pos/PosPage.jsx';
import DashboardPage from '../features/dashboard/DashboardPage.jsx';
import ProductsPage from '../features/products/ProductsPage.jsx';
import ProductFormPage from '../features/products/ProductFormPage.jsx';
import InvoicesPage from '../features/invoices/InvoicesPage.jsx';
import ReportsPage from '../features/reports/ReportsPage.jsx';

function RequireAuth({ children }) {
  const status = useSelector((s) => s.auth.status);
  const location = useLocation();
  return status === 'authenticated' ? children : <Navigate to="/login" replace state={{ from: location }} />;
}

function GuestOnly({ children }) {
  const status = useSelector((s) => s.auth.status);
  return status === 'authenticated' ? <Navigate to="/" replace /> : children;
}

function RequireStaff() {
  const role = useSelector((s) => s.auth.user?.role);
  return isStaff(role) ? <Outlet /> : <Navigate to="/" replace />;
}

function HomeRedirect() {
  const role = useSelector((s) => s.auth.user?.role);
  return <Navigate to={isStaff(role) ? '/dashboard' : '/pos'} replace />;
}

export default function App() {
  const dispatch = useDispatch();
  const status = useSelector((s) => s.auth.status);

  useEffect(() => {
    dispatch(bootstrapAuth());
  }, [dispatch]);

  if (status === 'loading') return <FullPageSpinner />;

  return (
    <>
      <Routes>
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
        <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<HomeRedirect />} />
          <Route path="pos" element={<PosPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route element={<RequireStaff />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="products/new" element={<ProductFormPage />} />
            <Route path="products/:id" element={<ProductFormPage />} />
          </Route>
          <Route path="*" element={<p className="p-8 text-center text-slate-500">Page not found.</p>} />
        </Route>
      </Routes>
      <Toasts />
    </>
  );
}