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
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { PieChart as EChartsPieChart } from 'echarts/charts';
import { GraphicComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/client.js';

echarts.use([EChartsPieChart, GraphicComponent, TooltipComponent, SVGRenderer]);

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
    { name: 'Faol', value: stats.active || 0, color: '#22C55E', light: '#86EFAC' },
    { name: 'Nosoz', value: stats.broken || 0, color: '#F5B81B', light: '#FDE68A' },
    { name: 'Chiqarilgan', value: stats.disposed || 0, color: '#EF4444', light: '#FCA5A5' },
  ], [stats]);

  const statusChartOption = useMemo(() => ({
    animationDuration: 900,
    animationEasing: 'cubicOut',
    color: statusData.map((item) => item.color),
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15, 23, 42, .94)',
      borderWidth: 0,
      padding: [11, 14],
      textStyle: { color: '#fff', fontFamily: 'inherit' },
      extraCssText: 'border-radius:10px;box-shadow:0 12px 30px rgba(15,23,42,.2)',
      formatter: ({ marker, name, value, percent }) => (
        `${marker}<strong>${name}</strong><br/>${numberFormatter.format(value)} ta aktiv &nbsp; <span style="color:#94a3b8">${percent}%</span>`
      ),
    },
    series: [{
      name: 'Aktivlar holati',
      type: 'pie',
      radius: ['53%', '78%'],
      center: ['50%', '48%'],
      startAngle: 90,
      clockwise: true,
      minAngle: 3,
      padAngle: 3,
      avoidLabelOverlap: true,
      itemStyle: {
        borderRadius: 9,
        borderColor: '#fff',
        borderWidth: 3,
        shadowBlur: 18,
        shadowColor: 'rgba(15, 45, 67, .16)',
        shadowOffsetY: 8,
      },
      emphasis: {
        scale: true,
        scaleSize: 8,
        itemStyle: {
          shadowBlur: 28,
          shadowColor: 'rgba(15, 45, 67, .28)',
          shadowOffsetY: 12,
        },
      },
      label: { show: false },
      labelLine: { show: false },
      data: statusData.map((item) => ({
        name: item.name,
        value: item.value,
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 1,
            y2: 1,
            colorStops: [
              { offset: 0, color: item.light },
              { offset: 0.48, color: item.color },
              { offset: 1, color: item.color },
            ],
          },
        },
      })),
    }],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '38%',
        style: {
          text: numberFormatter.format(stats.total || 0),
          fill: '#173B57',
          fontSize: 34,
          fontWeight: 800,
          textAlign: 'center',
        },
      },
      {
        type: 'text',
        left: 'center',
        top: '54%',
        style: {
          text: 'jami aktiv',
          fill: '#8291A3',
          fontSize: 12,
          fontWeight: 500,
          textAlign: 'center',
        },
      },
    ],
  }), [stats.total, statusData]);

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
              <ReactEChartsCore
                echarts={echarts}
                className="dashboard-status-chart"
                option={statusChartOption}
                notMerge
                lazyUpdate
                opts={{ renderer: 'svg' }}
              />
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
