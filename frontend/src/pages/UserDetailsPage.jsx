import React from 'react';
import { HistoryOutlined, LaptopOutlined, PhoneOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Form, message, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { api } from '../api/client.js';
import SafeImage from '../components/SafeImage.jsx';

export default function UserDetailsPage() {
  const { id } = useParams();
  const currentUser = useSelector((state) => state.auth.user);
  const [user, setUser] = useState();
  const [warehouseAssets, setWarehouseAssets] = useState([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [form] = Form.useForm();
  const loadUser = () => api.get(`/users/${id}`).then((response) => setUser(response.data));
  useEffect(() => { loadUser(); }, [id]);
  const openAssign = async () => {
    try {
      const { data } = await api.get('/maintenance/warehouse-assets');
      setWarehouseAssets(data.filter((asset) => asset.status === 'ACTIVE' && !asset.assignedUserId));
      setAssignOpen(true);
    } catch (error) {
      message.error(error.response?.data?.message || 'Omborxonadagi qurilmalarni yuklab bo‘lmadi');
    }
  };
  const assignAsset = async ({ assetId }) => {
    setAssigning(true);
    try {
      await api.post('/transactions/assign', { assetId, userId: Number(id), note: 'Xodim kartasi orqali biriktirildi' });
      message.success('Qurilma xodimga biriktirildi');
      setAssignOpen(false);
      form.resetFields();
      await loadUser();
    } catch (error) {
      message.error(error.response?.data?.message || 'Qurilmani biriktirib bo‘lmadi');
    } finally {
      setAssigning(false);
    }
  };
  if (!user) return null;
  const assets = user.assets || [];
  const assetColumns = [
    { title: 'Rasm', dataIndex: 'imageUrl', width: 72, render: (url) => <SafeImage src={url} width={42} height={42} /> },
    { title: 'Qurilma', dataIndex: 'name' }, { title: 'Model', dataIndex: 'model' }, { title: 'Inventar raqami', dataIndex: 'inventoryNumber' }, { title: 'Seria raqami', dataIndex: 'serialNumber' }, { title: 'Bo‘lim', render: (asset) => asset.department?.name || '—' },
  ];
  const historyColumns = [
    { title: 'Amal', dataIndex: 'type', render: (type) => <Tag color={type === 'ASSIGN' ? 'blue' : 'green'}>{type === 'ASSIGN' ? 'TOPSHIRILDI' : 'QABUL QILINDI'}</Tag> },
    { title: 'Qurilma', render: (row) => row.asset?.name || '—' }, { title: 'Model', render: (row) => row.asset?.model || '—' }, { title: 'Inventar raqami', render: (row) => row.asset?.inventoryNumber || '—' },
    { title: 'Bo‘lim yo‘nalishi', render: (row) => <span>{row.fromDepartment?.name || '—'} <span className="history-arrow">→</span> {row.toDepartment?.name || '—'}</span> },
    { title: 'Xodim yo‘nalishi', render: (row) => <span>{row.fromUser?.fullName || 'Biriktirilmagan'} <span className="history-arrow">→</span> {row.user?.fullName || 'Biriktirilmagan'}</span> },
    { title: 'Sana', dataIndex: 'createdAt', render: (date) => new Date(date).toLocaleString('uz-UZ') },
  ];
  return <div className="user-detail"><Card className="user-hero" bordered={false}><div className="user-avatar"><SafeImage src={user.imageUrl} width={96} height={96} rounded user preview /></div><div><Typography.Text className="asset-kicker">FOYDALANUVCHI KARTASI</Typography.Text><Typography.Title level={2}>{user.fullName}</Typography.Title><div className="user-meta"><span><UserOutlined /> Login: {user.login || '—'}</span><span><PhoneOutlined /> {user.phone || 'Telefon kiritilmagan'}</span><Tag color="blue">{user.role}</Tag></div></div><div className="user-stat"><LaptopOutlined /><span><strong>{assets.length}</strong>Hozirgi qurilmalar</span></div></Card><Card title="Hozir foydalanayotgan qurilmalar" className="user-section" extra={<Space>{currentUser?.role === 'ADMIN' && <Button type="primary" icon={<PlusOutlined />} onClick={openAssign}>Yangi qurilma</Button>}<Tag icon={<LaptopOutlined />}>{assets.length} ta qurilma</Tag></Space>}>{assets.length ? <Table rowKey="id" dataSource={assets} columns={assetColumns} scroll={{ x: 900 }} pagination={{ pageSize: 8, showSizeChanger: false }}/> : <Empty description="Hozircha biriktirilgan qurilma yo‘q" image={Empty.PRESENTED_IMAGE_SIMPLE}/>}</Card><Card title="Oldingi qurilmalardan foydalanish tarixi" className="user-section" extra={<HistoryOutlined />}>{user.history?.length ? <Table rowKey="id" dataSource={user.history} columns={historyColumns} scroll={{ x: 1180 }} pagination={{ pageSize: 8, showSizeChanger: false }}/> : <Empty description="Qurilmalar tarixi hali yo‘q" image={Empty.PRESENTED_IMAGE_SIMPLE}/>}</Card><Modal title={`${user.fullName}ga yangi qurilma biriktirish`} open={assignOpen} onCancel={() => { setAssignOpen(false); form.resetFields(); }} onOk={() => form.submit()} okText="Biriktirish" cancelText="Bekor qilish" confirmLoading={assigning}><Form form={form} layout="vertical" onFinish={assignAsset}><Form.Item name="assetId" label="Omborxonadagi qurilma" rules={[{ required: true, message: 'Qurilmani tanlang' }]}><Select showSearch optionFilterProp="label" placeholder="Qurilmani tanlang" notFoundContent="Omborxonada bo‘sh qurilma mavjud emas" options={warehouseAssets.map((asset) => ({ value: asset.id, label: `${asset.name} — ${asset.model || 'Model ko‘rsatilmagan'} — ${asset.inventoryNumber}` }))} /></Form.Item></Form></Modal></div>;
}
