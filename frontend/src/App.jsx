import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useSelector } from 'react-redux';
import MainLayout from './components/MainLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import AssetsPage from './pages/AssetsPage.jsx';
import AssetDetailsPage from './pages/AssetDetailsPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import UserDetailsPage from './pages/UserDetailsPage.jsx';
import DepartmentsPage from './pages/DepartmentsPage.jsx';
import DepartmentDetailsPage from './pages/DepartmentDetailsPage.jsx';
import MaintenancePage from './pages/MaintenancePage.jsx';
import AuditPage from './pages/AuditPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import DeliveryActVerifyPage from './pages/DeliveryActVerifyPage.jsx';
import DeliveryActsPage from './pages/DeliveryActsPage.jsx';

function PrivateRoute({ children }) {
  const token = useSelector((s) => s.auth.token);
  return token ? children : <Navigate to="/login" replace />;
}

function HomeRoute() {
  const user = useSelector((state) => state.auth.user);
  return user?.role === 'ADMIN' ? <DashboardPage /> : <Navigate to={`/users/${user?.id}`} replace />;
}

export default function App() {
  return <BrowserRouter><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/verify-delivery-act/:id" element={<DeliveryActVerifyPage />} />
    <Route path="/" element={<PrivateRoute><MainLayout /></PrivateRoute>}>
      <Route index element={<HomeRoute />} />
      <Route path="assets" element={<AssetsPage />} />
      <Route path="assets/:id" element={<AssetDetailsPage />} />
      <Route path="users" element={<UsersPage />} />
      <Route path="users/:id" element={<UserDetailsPage />} />
      <Route path="departments" element={<DepartmentsPage />} />
      <Route path="departments/:id" element={<DepartmentDetailsPage />} />
      <Route path="maintenance" element={<MaintenancePage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="delivery-acts" element={<DeliveryActsPage />} />
      <Route path="audit" element={<AuditPage />} />
    </Route>
  </Routes></BrowserRouter>;
}
