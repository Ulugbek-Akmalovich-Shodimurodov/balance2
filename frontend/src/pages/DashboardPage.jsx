import React, { useEffect, useMemo, useState } from 'react';
import {
  ApartmentOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  LaptopOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  ToolOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { Button, Card, Col, Progress, Row, Space, Table, Tag, Typography } from 'antd';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/client.js';

const statusMeta = {
  ACTIVE: { label: 'Faol', color: 'green' },
  BROKEN: { label: 'Nosoz', color: 'gold' },
  DISPOSED: { label: 'Chiqarilgan', color: 'red' },
};

const numberFormatter = new Intl.NumberFormat('uz-UZ');

export default function DashboardPage() {
  const navigate = useNavigate();
  const currentUser = useSelector((state) => state.auth.user);
  const [stats, setStats] = useState({ perDepartment: [], recentAssets: [] });

  useEffect(() => {
    api.get('/dashboard/stats').then((response) => setStats(response.data));
  }, []);

  const statusData = useMemo(() => [
    { name: 'Faol', value: stats.active || 0, color: '#36B878', shadow: '#1D704A', gradient: 'activeGradient' },
    { name: 'Nosoz', value: stats.broken || 0, color: '#F0B12F', shadow: '#A97009', gradient: 'brokenGradient' },
    { name: 'Chiqarilgan', value: stats.disposed || 0, color: '#E26060', shadow: '#9E3434', gradient: 'disposedGradient' },
  ], [stats]);

  const departmentData = (stats.perDepartment || []).slice(0, 7);
  const today = new Intl.DateTimeFormat('uz-UZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const kpis = [
    {
      title: 'Jami aktivlar',
      value: stats.total || 0,
      subtitle: `${stats.departments || 0} ta bo‘limda`,
      icon: LaptopOutlined,
      tone: 'blue',
    },
    {
      title: 'Faol aktivlar',
      value: stats.active || 0,
      subtitle: `${stats.activeRate || 0}% foydalanishga tayyor`,
      icon: CheckCircleOutlined,
      tone: 'green',
    },
    {
      title: 'Biriktirilgan',
      value: stats.assigned || 0,
      subtitle: `${stats.unassigned || 0} ta biriktirilmagan`,
      icon: UserSwitchOutlined,
      tone: 'violet',
    },
    {
      title: 'Ochiq texnik xizmat',
      value: stats.openMaintenance || 0,
      subtitle: `${stats.broken || 0} ta nosoz aktiv`,
      icon: ToolOutlined,
      tone: 'orange',
    },
  ];

  const recentColumns = [
    {
      title: 'Aktiv',
      render: (asset) => (
        <button className="dashboard-asset-link" type="button" onClick={() => navigate(`/assets/${asset.id}`)}>
          <span className="dashboard-asset-icon"><LaptopOutlined /></span>
          <span><strong>{asset.name}</strong><small>{asset.model || 'Model kiritilmagan'}</small></span>
        </button>
      ),
    },
    { title: 'Inventar raqami', dataIndex: 'inventoryNumber' },
    { title: 'Bo‘lim', render: (asset) => asset.department?.name || 'Biriktirilmagan' },
    {
      title: 'Holat',
      dataIndex: 'status',
      render: (status) => <Tag color={statusMeta[status]?.color}>{statusMeta[status]?.label || status}</Tag>,
    },
  ];

  return (
    <div className="executive-dashboard">
      <section className="dashboard-welcome">
        <div>
          <Typography.Text className="dashboard-eyebrow">ADMINISTRATOR PANELI</Typography.Text>
          <Typography.Title level={2}>Xush kelibsiz, {currentUser?.fullName}</Typography.Title>
          <Typography.Paragraph>
            Tizim holati va tashkilot aktivlarining bugungi umumiy ko‘rinishi.
          </Typography.Paragraph>
          <Typography.Text className="dashboard-date">{today}</Typography.Text>
        </div>
        <Space wrap>
          <Button icon={<FileTextOutlined />} onClick={() => navigate('/reports')}>Hisobotlar</Button>
          <Button type="primary" icon={<LaptopOutlined />} onClick={() => navigate('/assets')}>
            Aktivlarni boshqarish
          </Button>
        </Space>
      </section>

      <Row gutter={[16, 16]} className="dashboard-kpi-grid">
        {kpis.map(({ title, value, subtitle, icon: Icon, tone }) => (
          <Col xs={24} sm={12} xl={6} key={title}>
            <Card className={`dashboard-kpi dashboard-kpi-${tone}`} bordered={false}>
              <div className="dashboard-kpi-top">
                <span className="dashboard-kpi-icon"><Icon /></span>
                <Typography.Text>{title}</Typography.Text>
              </div>
              <strong>{numberFormatter.format(value)}</strong>
              <Typography.Text type="secondary">{subtitle}</Typography.Text>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <Card
            className="dashboard-chart-card"
            title={<div><strong>Aktivlar holati</strong><small>Joriy holat bo‘yicha taqsimot</small></div>}
          >
            <div className="dashboard-donut">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <defs>
                    <linearGradient id="activeGradient" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#54CC8D" />
                      <stop offset="100%" stopColor="#258F5D" />
                    </linearGradient>
                    <linearGradient id="brokenGradient" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#FFD264" />
                      <stop offset="100%" stopColor="#D89412" />
                    </linearGradient>
                    <linearGradient id="disposedGradient" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#F07A7A" />
                      <stop offset="100%" stopColor="#BE4444" />
                    </linearGradient>
                    <filter id="donut3dShadow" x="-30%" y="-30%" width="160%" height="180%">
                      <feDropShadow dx="0" dy="7" stdDeviation="6" floodColor="#173b57" floodOpacity=".24" />
                    </filter>
                  </defs>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    innerRadius={75}
                    outerRadius={105}
                    cy="51%"
                    paddingAngle={4}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {statusData.map((item) => <Cell key={`shadow-${item.name}`} fill={item.shadow} />)}
                  </Pie>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    innerRadius={75}
                    outerRadius={105}
                    cy="48%"
                    paddingAngle={4}
                    stroke="none"
                    style={{ filter: 'url(#donut3dShadow)' }}
                  >
                    {statusData.map((item) => <Cell key={item.name} fill={`url(#${item.gradient})`} />)}
                  </Pie>
                  <Tooltip formatter={(value, name) => [numberFormatter.format(value), name]} />
                  <text x="50%" y="44%" textAnchor="middle" className="dashboard-donut-value">
                    {stats.total || 0}
                  </text>
                  <text x="50%" y="53%" textAnchor="middle" className="dashboard-donut-label">
                    jami aktiv
                  </text>
                </PieChart>
              </ResponsiveContainer>
              <div className="dashboard-legend">
                {statusData.map((item) => (
                  <div key={item.name}>
                    <span style={{ background: item.color }} />
                    <span className="dashboard-legend-label">{item.name}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} xl={14}>
          <Card
            className="dashboard-chart-card"
            title={<div><strong>Bo‘limlar kesimida</strong><small>Aktivlar soni bo‘yicha yetakchi bo‘limlar</small></div>}
            extra={<Button type="link" onClick={() => navigate('/departments')}>Barchasi <ArrowRightOutlined /></Button>}
          >
            <ResponsiveContainer width="100%" height={310}>
              <BarChart data={departmentData} layout="vertical" margin={{ top: 8, right: 25, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e8eef4" />
                <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={105} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f4f8fb' }} formatter={(value) => [`${value} ta`, 'Aktivlar']} />
                <Bar dataKey="total" fill="#2878D0" radius={[0, 7, 7, 0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="dashboard-bottom-row">
        <Col xs={24} xl={17}>
          <Card
            className="dashboard-table-card"
            title={<div><strong>So‘nggi qo‘shilgan aktivlar</strong><small>Yaqinda ro‘yxatdan o‘tkazilgan qurilmalar</small></div>}
            extra={<Button type="link" onClick={() => navigate('/assets')}>Barchasini ko‘rish <ArrowRightOutlined /></Button>}
          >
            <Table
              rowKey="id"
              dataSource={stats.recentAssets || []}
              columns={recentColumns}
              pagination={false}
              scroll={{ x: 720 }}
              locale={{ emptyText: 'Aktivlar mavjud emas' }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={7}>
          <Card className="dashboard-health-card" title="Tizim ko‘rsatkichlari">
            <div className="dashboard-health-item">
              <span><SafetyCertificateOutlined /> Faol aktivlar ulushi</span>
              <strong>{stats.activeRate || 0}%</strong>
              <Progress percent={stats.activeRate || 0} showInfo={false} strokeColor="#25A56A" />
            </div>
            <div className="dashboard-health-item">
              <span><UserSwitchOutlined /> Biriktirish darajasi</span>
              <strong>{stats.assignedRate || 0}%</strong>
              <Progress percent={stats.assignedRate || 0} showInfo={false} strokeColor="#7158D9" />
            </div>
            <div className="dashboard-mini-stats">
              <div><TeamOutlined /><span><strong>{stats.users || 0}</strong>Foydalanuvchi</span></div>
              <div><ApartmentOutlined /><span><strong>{stats.departments || 0}</strong>Bo‘lim</span></div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
