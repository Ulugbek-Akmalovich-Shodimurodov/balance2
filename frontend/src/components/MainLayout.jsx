import React from 'react';
import { AppstoreOutlined, AuditOutlined, BankOutlined, BellOutlined, DashboardOutlined, FileExcelOutlined, LaptopOutlined, LogoutOutlined, ToolOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Badge, Dropdown, Layout, Menu, Tooltip, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { api } from '../api/client.js';
import { logout } from '../store/store.js';
const { Header, Sider, Content } = Layout;

export default function MainLayout() {
  const navigate = useNavigate(); const dispatch = useDispatch(); const user = useSelector((state) => state.auth.user);
  const [profile, setProfile] = useState(user);
  const [newRequests, setNewRequests] = useState(0);
  useEffect(() => { if (user?.id) api.get(`/users/${user.id}`).then((response) => setProfile(response.data)).catch(() => {}); }, [user?.id]);
  const signOut = () => { dispatch(logout()); navigate('/login'); };
  const isAdmin = user?.role === 'ADMIN';
  useEffect(() => {
    if (!isAdmin) return undefined;
    const loadRequests = () => api.get('/maintenance').then((response) => setNewRequests(response.data.filter((item) => (item.status || 'NEW') === 'NEW').length)).catch(() => {});
    loadRequests(); const timer = setInterval(loadRequests, 30000);
    return () => clearInterval(timer);
  }, [isAdmin]);
  const items = isAdmin ? [
    { key: '/', icon: <DashboardOutlined />, label: 'Boshqaruv paneli' }, { key: '/assets', icon: <LaptopOutlined />, label: 'Aktivlar' },
    { key: '/users', icon: <UserOutlined />, label: 'Foydalanuvchilar' }, { key: '/departments', icon: <BankOutlined />, label: 'Bo‘limlar' },
    { key: '/maintenance', icon: <ToolOutlined />, label: <span className="menu-notification">Texnik xizmat <Badge count={newRequests} size="small"/></span> }, { key: '/reports', icon: <FileExcelOutlined />, label: 'Hisobotlar' },
    { key: '/audit', icon: <AuditOutlined />, label: 'Audit log' },
  ] : [
    { key: `/users/${user?.id}`, icon: <UserOutlined />, label: 'Mening profilim' },
    { key: '/assets', icon: <LaptopOutlined />, label: 'Mening qurilmalarim' },
    { key: '/maintenance', icon: <ToolOutlined />, label: 'Texnik xizmat' },
  ];
  const avatarMenu = { items: [{ key: 'profile', icon: <UserOutlined />, label: 'Mening profilim' }, { type: 'divider' }, { key: 'logout', icon: <LogoutOutlined />, label: 'Chiqish' }], onClick: ({ key }) => { if (key === 'logout') signOut(); if (key === 'profile') navigate(`/users/${user?.id}`); } };
  const initials = profile?.fullName?.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'U';
  return <Layout className="app-layout"><Sider breakpoint="lg" collapsedWidth="0"><div className="brand"><AppstoreOutlined /> Aktivlar</div><Menu theme="dark" mode="inline" items={items} onClick={({ key }) => navigate(key)} /></Sider><Layout><Header className="topbar"><div><Typography.Text strong>{profile?.fullName}</Typography.Text><Typography.Text type="secondary" className="header-role">{profile?.role}</Typography.Text></div><div className="header-actions">{isAdmin && <Tooltip title="Yangi texnik xizmat so‘rovlari"><button className="notification-bell" type="button" onClick={() => navigate('/maintenance')}><Badge count={newRequests} size="small"><BellOutlined /></Badge></button></Tooltip>}<Dropdown menu={avatarMenu} trigger={['click']} placement="bottomRight"><button className="profile-avatar-button" type="button" aria-label="Profil menyusi"><Avatar size={42} src={profile?.imageUrl} icon={<UserOutlined />} onError={() => false}>{initials}</Avatar><span className="avatar-logout"><LogoutOutlined /></span></button></Dropdown></div></Header><Content className="content"><Outlet /></Content></Layout></Layout>;
}
