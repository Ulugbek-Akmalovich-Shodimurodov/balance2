import React, { useEffect, useState } from 'react';
import { ApartmentOutlined, LaptopOutlined, SwapOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Card, Descriptions, Empty, Form, Input, Modal, Select, Table, Tag, Typography, message } from 'antd';
import { useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import SafeImage from '../components/SafeImage.jsx';
import UserNameLink from '../components/UserNameLink.jsx';

export default function AssetDetailsPage() {
  const { id } = useParams();
  const [asset, setAsset] = useState();
  const [history, setHistory] = useState([]);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [form] = Form.useForm();
  const selectedDepartmentId = Form.useWatch('departmentId', form);
  const load = () => { api.get(`/assets/${id}`).then((response) => setAsset(response.data)); api.get(`/transactions/asset/${id}`).then((response) => setHistory(response.data)); };
  useEffect(() => { load(); api.get('/users').then((response) => setUsers(response.data)); api.get('/departments').then((response) => setDepartments(response.data)); }, [id]);
  if (!asset) return null;

  const isWarehouse = departments.find((department) => department.id === Number(selectedDepartmentId))?.name?.trim().toLocaleLowerCase() === 'omborxona';
  const availableUsers = selectedDepartmentId ? users.filter((user) => user.department?.id === Number(selectedDepartmentId)) : users;
  const transfer = async (values) => {
    try {
      await api.post('/transactions/assign', { assetId: Number(id), userId: isWarehouse ? null : values.userId, departmentId: values.departmentId, note: values.note });
      message.success(isWarehouse ? 'Qurilma omborxonaga qabul qilindi' : 'Qurilma boshqa xodimga o‘tkazildi');
      setTransferOpen(false); form.resetFields(); load();
    } catch (error) { message.error(error.response?.data?.message || 'Qurilmani o‘tkazib bo‘lmadi'); }
  };
  const historyColumns = [
    { title: 'Holat', dataIndex: 'type', width: 120, render: (type) => <Tag color={type === 'ASSIGN' ? 'blue' : 'green'}>{type === 'ASSIGN' ? 'TOPSHIRILDI' : 'QABUL QILINDI'}</Tag> },
    { title: 'Kimdan', render: (row) => <UserNameLink user={row.fromUser} /> }, { title: 'Kimga', render: (row) => <UserNameLink user={row.user} /> },
    { title: 'Yo‘nalish', render: (row) => <span>{row.fromDepartment?.name || '—'} <span className="history-arrow">→</span> {row.toDepartment?.name || '—'}</span> },
    { title: 'Sana va vaqt', dataIndex: 'createdAt', width: 180, render: (date) => new Date(date).toLocaleString('uz-UZ') }, { title: 'Amalni bajargan', render: (row) => <UserNameLink user={row.actor} /> }
  ];

  return <div className="asset-detail">
    <div className="asset-detail-header"><div><Typography.Text className="asset-kicker">QURILMA KARTASI</Typography.Text><Typography.Title level={2}>{asset.name}</Typography.Title><Typography.Text type="secondary">{asset.model || 'Model kiritilmagan'}</Typography.Text></div><Button type="primary" size="large" icon={<SwapOutlined />} onClick={() => { form.setFieldsValue({ departmentId: asset.departmentId, userId: undefined }); setTransferOpen(true); }}>Boshqa xodimga o‘tkazish</Button></div>
    <Card className="asset-hero" bordered={false}><div className="asset-image-wrap"><SafeImage src={asset.imageUrl} width={260} height={220} preview={{ mask: 'Kattalashtirish' }} /></div><div className="asset-hero-content"><Tag color="blue" className="asset-status-tag">{asset.status === 'BROKEN' ? 'NOSOZ' : asset.status === 'DISPOSED' ? 'FOYDALANISHDAN CHIQARILGAN' : 'FAOL'}</Tag><Typography.Title level={3}>{asset.name}</Typography.Title><Typography.Paragraph className="asset-model">{asset.model || 'Model kiritilmagan'}</Typography.Paragraph><div className="asset-current-info"><div><UserOutlined /><span><small>HOZIRGI XODIM</small>{asset.assignedUser?.fullName || 'Biriktirilmagan'}</span></div><div><ApartmentOutlined /><span><small>HOZIRGI BO‘LIM</small>{asset.department?.name || 'Biriktirilmagan'}</span></div></div></div></Card>
    <div className="asset-info-grid"><Card title="Qurilma ma’lumotlari" className="asset-info-card"><Descriptions column={{ xs: 1, sm: 2 }} layout="vertical"><Descriptions.Item label="Nomi">{asset.name}</Descriptions.Item><Descriptions.Item label="Model">{asset.model || '—'}</Descriptions.Item><Descriptions.Item label="Inventar raqami"><Typography.Text code>{asset.inventoryNumber}</Typography.Text></Descriptions.Item><Descriptions.Item label="Yili">{asset.manufactureYear || '—'}</Descriptions.Item></Descriptions></Card><Card title="Biriktirish holati" className="asset-info-card"><Descriptions column={1} layout="vertical"><Descriptions.Item label="Foydalanuvchi">{asset.assignedUser?.fullName || 'Biriktirilmagan'}</Descriptions.Item><Descriptions.Item label="Bo‘lim">{asset.department?.name || 'Biriktirilmagan'}</Descriptions.Item></Descriptions></Card></div>
    <Card title="Topshirish-qabul qilish tarixi" className="asset-history-card" extra={<Tag>{history.length} ta qayd</Tag>}>{history.length ? <Table rowKey="id" dataSource={history} columns={historyColumns} scroll={{ x: 980 }} pagination={{ pageSize: 8, showSizeChanger: false }} /> : <Empty description="Hali topshirish-qabul qilish tarixi yo‘q" image={Empty.PRESENTED_IMAGE_SIMPLE} />}</Card>
    <Modal title={isWarehouse ? 'Qurilmani omborxonaga qabul qilish' : 'Qurilmani boshqa xodimga o‘tkazish'} open={transferOpen} onCancel={() => { setTransferOpen(false); form.resetFields(); }} onOk={() => form.submit()} okText={isWarehouse ? 'Omborxonaga qabul qilish' : 'O‘tkazish'}>
      <Form form={form} layout="vertical" onFinish={transfer}><Form.Item name="departmentId" label="Yangi bo‘lim" rules={[{ required: true, message: 'Bo‘limni tanlang' }]}><Select showSearch optionFilterProp="label" onChange={() => form.setFieldValue('userId', undefined)} options={departments.map((department) => ({ value: department.id, label: department.name }))} /></Form.Item>{!isWarehouse && <Form.Item name="userId" label="Yangi xodim" rules={[{ required: true, message: 'Xodimni tanlang' }]}><Select showSearch optionFilterProp="label" disabled={!selectedDepartmentId} placeholder={selectedDepartmentId ? 'Xodimni tanlang' : 'Avval bo‘limni tanlang'} options={availableUsers.map((user) => ({ value: user.id, label: user.fullName }))} /></Form.Item>}<Form.Item name="note" label="Izoh"><Input.TextArea rows={3} placeholder={isWarehouse ? 'Omborxonaga qabul qilish bo‘yicha izoh' : 'O‘tkazish sababi yoki izoh'} /></Form.Item></Form>
    </Modal>
  </div>;
}
