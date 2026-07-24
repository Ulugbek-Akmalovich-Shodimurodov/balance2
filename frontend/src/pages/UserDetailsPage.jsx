import React from 'react';
import { HistoryOutlined, LaptopOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';
import { Card, Empty, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import SafeImage from '../components/SafeImage.jsx';

export default function UserDetailsPage() {
  const { id } = useParams();
  const [user, setUser] = useState();
  useEffect(() => { api.get(`/users/${id}`).then((response) => setUser(response.data)); }, [id]);
  if (!user) return null;
  const assets = user.assets || [];
  const assetColumns = [
    { title: 'Rasm', dataIndex: 'imageUrl', width: 72, render: (url) => <SafeImage src={url} width={42} height={42} /> },
    { title: 'Qurilma', dataIndex: 'name' }, { title: 'Model', dataIndex: 'model' }, { title: 'Inventar raqami', dataIndex: 'inventoryNumber' }, { title: 'Seria raqami', dataIndex: 'serialNumber' }, { title: 'Bo‘lim', render: (asset) => asset.department?.name || '—' },
  ];
  const historyColumns = [
    { title: 'Amal', dataIndex: 'type', render: (type) => <Tag color={type === 'ASSIGN' ? 'blue' : 'green'}>{type === 'ASSIGN' ? 'TOPSHIRILDI' : 'QABUL QILINDI'}</Tag> },
    { title: 'Qurilma', render: (row) => row.asset?.name || '—' }, { title: 'Model', render: (row) => row.asset?.model || '—' }, { title: 'Inventar raqami', render: (row) => row.asset?.inventoryNumber || '—' },
    { title: 'Yo‘nalish', render: (row) => <span>{row.fromDepartment?.name || '—'} <span className="history-arrow">→</span> {row.toDepartment?.name || '—'}</span> }, { title: 'Sana', dataIndex: 'createdAt', render: (date) => new Date(date).toLocaleString('uz-UZ') },
  ];
  return <div className="user-detail"><Card className="user-hero" bordered={false}><div className="user-avatar"><SafeImage src={user.imageUrl} width={96} height={96} rounded user preview /></div><div><Typography.Text className="asset-kicker">FOYDALANUVCHI KARTASI</Typography.Text><Typography.Title level={2}>{user.fullName}</Typography.Title><div className="user-meta"><span><UserOutlined /> Login: {user.login || '—'}</span><span><PhoneOutlined /> {user.phone || 'Telefon kiritilmagan'}</span><Tag color="blue">{user.role}</Tag></div></div><div className="user-stat"><LaptopOutlined /><span><strong>{assets.length}</strong>Hozirgi qurilmalar</span></div></Card><Card title="Hozir foydalanayotgan qurilmalar" className="user-section" extra={<Tag icon={<LaptopOutlined />}>{assets.length} ta qurilma</Tag>}>{assets.length ? <Table rowKey="id" dataSource={assets} columns={assetColumns} scroll={{ x: 900 }} pagination={{ pageSize: 8, showSizeChanger: false }}/> : <Empty description="Hozircha biriktirilgan qurilma yo‘q" image={Empty.PRESENTED_IMAGE_SIMPLE}/>}</Card><Card title="Oldingi qurilmalardan foydalanish tarixi" className="user-section" extra={<HistoryOutlined />}>{user.history?.length ? <Table rowKey="id" dataSource={user.history} columns={historyColumns} scroll={{ x: 900 }} pagination={{ pageSize: 8, showSizeChanger: false }}/> : <Empty description="Qurilmalar tarixi hali yo‘q" image={Empty.PRESENTED_IMAGE_SIMPLE}/>}</Card></div>;
}
