import React from 'react';
import { AppstoreOutlined, AuditOutlined, BellOutlined, DashboardOutlined, FileExcelOutlined, FileProtectOutlined, LaptopOutlined, LogoutOutlined, MenuOutlined, ToolOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Badge, Button, Drawer, Dropdown, Layout, Menu, Tooltip, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { api } from '../api/client.js';
import { logout } from '../store/store.js';
const { Header, Sider, Content } = Layout;

export default function MainLayout() {
  const navigate = useNavigate(); const location = useLocation(); const dispatch = useDispatch(); const user = useSelector((state) => state.auth.user);
  const [profile, setProfile] = useState(user);
  const [newRequests, setNewRequests] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => { if (user?.id) api.get(`/users/${user.id}`).then((response) => setProfile(response.data)).catch(() => setProfile(user)); }, [user]);
  const signOut = () => { dispatch(logout()); navigate('/login'); };
  const isSuperAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(user?.role);
  const isOrganizationAdmin = user?.role === 'ORGANIZATION_ADMIN';
  const isAdmin = isSuperAdmin || isOrganizationAdmin;
  useEffect(() => {
    if (!isAdmin) return undefined;
    const loadRequests = () => api.get('/maintenance').then((response) => setNewRequests(response.data.filter((item) => (item.status || 'NEW') === 'NEW').length)).catch(() => {});
    loadRequests(); const timer = setInterval(loadRequests, 30000);
    return () => clearInterval(timer);
  }, [isAdmin]);
  const items = isSuperAdmin ? [
    { key: '/', icon: <DashboardOutlined />, label: 'Boshqaruv paneli' }, { key: '/organization', icon: <AppstoreOutlined />, label: 'Tashkilot tuzilmasi' }, { key: '/assets', icon: <LaptopOutlined />, label: 'Aktivlar' },
    { key: '/users', icon: <UserOutlined />, label: 'Foydalanuvchilar' },
    { key: '/maintenance', icon: <ToolOutlined />, label: <span className="menu-notification">Texnik xizmat <Badge count={newRequests} size="small"/></span> }, { key: '/reports', icon: <FileExcelOutlined />, label: 'Hisobotlar' },
    { key: '/delivery-acts', icon: <FileProtectOutlined />, label: 'Dalolatnomalar' },
    { key: '/audit', icon: <AuditOutlined />, label: 'Audit jurnali' },
  ] : isOrganizationAdmin ? [
    { key: '/', icon: <DashboardOutlined />, label: 'Boshqaruv paneli' },
    { key: '/organization', icon: <AppstoreOutlined />, label: 'Tashkilot tuzilmasi' },
    { key: '/assets', icon: <LaptopOutlined />, label: 'Aktivlar' },
    { key: '/users', icon: <UserOutlined />, label: 'Foydalanuvchilar' },
    { key: '/maintenance', icon: <ToolOutlined />, label: <span className="menu-notification">Texnik xizmat <Badge count={newRequests} size="small"/></span> },
    { key: '/reports', icon: <FileExcelOutlined />, label: 'Hisobotlar' },
    { key: '/delivery-acts', icon: <FileProtectOutlined />, label: 'Dalolatnomalar' },
    { key: `/users/${user?.id}`, icon: <UserOutlined />, label: 'Mening profilim' },
  ] : [
    { key: `/users/${user?.id}`, icon: <UserOutlined />, label: 'Mening profilim' },
    { key: '/assets', icon: <LaptopOutlined />, label: 'Mening qurilmalarim' },
    { key: '/delivery-acts', icon: <FileProtectOutlined />, label: 'Dalolatnomalar' },
    { key: '/maintenance', icon: <ToolOutlined />, label: 'Texnik xizmat' },
  ];
  const avatarMenu = { items: [{ key: 'profile', icon: <UserOutlined />, label: 'Mening profilim' }, { type: 'divider' }, { key: 'logout', icon: <LogoutOutlined />, label: 'Chiqish' }], onClick: ({ key }) => { if (key === 'logout') signOut(); if (key === 'profile') navigate(`/users/${user?.id}`); } };
  const initials = profile?.fullName?.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'U';
  const openPage = ({ key }) => { navigate(key); setMobileMenuOpen(false); };
  return <Layout className="app-layout"><Sider breakpoint="lg" collapsedWidth="0" trigger={null}><div className="brand"><AppstoreOutlined /> Aktivlar</div><Menu theme="dark" mode="inline" items={items} selectedKeys={[location.pathname]} onClick={openPage} /></Sider><Drawer className="mobile-menu-drawer" placement="left" width={250} open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} closable={false}><div className="brand"><AppstoreOutlined /> Aktivlar</div><Menu theme="dark" mode="inline" items={items} selectedKeys={[location.pathname]} onClick={openPage} /></Drawer><Layout><Header className="topbar"><div className="topbar-user"><Button className="mobile-menu-button" type="text" icon={<MenuOutlined />} aria-label="Yon menyuni ochish" onClick={() => setMobileMenuOpen(true)} /><div><Typography.Text strong>{profile?.fullName}</Typography.Text><Typography.Text type="secondary" className="header-role">{profile?.role}</Typography.Text></div></div><div className="header-actions">{isAdmin && <Tooltip title="Yangi texnik xizmat so‘rovlari"><button className="notification-bell" type="button" onClick={() => navigate('/maintenance')}><Badge count={newRequests} size="small"><BellOutlined /></Badge></button></Tooltip>}<Dropdown menu={avatarMenu} trigger={['click']} placement="bottomRight"><button className="profile-avatar-button" type="button" aria-label="Profil menyusi"><Avatar size={42} src={profile?.imageUrl} icon={<UserOutlined />} onError={() => false}>{initials}</Avatar><span className="avatar-logout"><LogoutOutlined /></span></button></Dropdown></div></Header><Content className="content"><Outlet /></Content></Layout></Layout>;
}
