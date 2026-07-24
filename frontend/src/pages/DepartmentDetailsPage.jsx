import React, { useEffect, useState } from 'react';
import { ApartmentOutlined, BankOutlined, CheckCircleFilled, EditOutlined, ExclamationCircleFilled, LaptopOutlined, StopFilled } from '@ant-design/icons';
import { Button, Card, Empty, Form, Image, Modal, Select, Table, Tag, Typography, message } from 'antd';
import { Link, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { api } from '../api/client.js';

const statusInfo = {
  ACTIVE: { label: 'Faol', icon: CheckCircleFilled, className: 'asset-status-active' },
  BROKEN: { label: 'Nosoz', icon: ExclamationCircleFilled, className: 'asset-status-broken' },
  DISPOSED: { label: 'Foydalanishdan chiqarilgan', icon: StopFilled, className: 'asset-status-disposed' }
};

const AssetStatus = ({ status }) => {
  const item = statusInfo[status] || { label: status || 'Noma’lum', icon: ExclamationCircleFilled, className: 'asset-status-unknown' };
  const Icon = item.icon;
  return <span className={`asset-status-pill ${item.className}`}><Icon />{item.label}</span>;
};

export default function DepartmentDetailsPage() {
  const { id } = useParams();
  const user = useSelector((state) => state.auth.user);
  const isAdmin = user?.role === 'ADMIN';
  const [department, setDepartment] = useState();
  const [editingAsset, setEditingAsset] = useState(null);
  const [form] = Form.useForm();
  const load = () => api.get(`/departments/${id}`).then((response) => setDepartment(response.data));
  useEffect(() => { load(); }, [id]);
  if (!department) return null;

  const updateStatus = async (values) => {
    try {
      await api.put(`/assets/${editingAsset.id}`, { status: values.status });
      message.success('Qurilma holati yangilandi');
      setEditingAsset(null); form.resetFields(); load();
    } catch (error) { message.error(error.response?.data?.message || 'Holatni yangilab bo‘lmadi'); }
  };

  const assetColumns = [
    { title: 'Rasm', dataIndex: 'imageUrl', width: 72, render: (url) => url ? <Image src={url} width={42} height={42} preview={false} style={{ objectFit: 'cover' }} /> : <LaptopOutlined /> },
    { title: 'Qurilma', dataIndex: 'name', render: (name, asset) => <Link to={`/assets/${asset.id}`}>{name}</Link> },
    { title: 'Model', dataIndex: 'model' }, { title: 'Inventar raqami', dataIndex: 'inventoryNumber' }, { title: 'Seria raqami', dataIndex: 'serialNumber' },
    { title: 'Holat', dataIndex: 'status', width: 160, render: (status) => <AssetStatus status={status} /> },
    { title: 'Foydalanuvchi', render: (asset) => asset.assignedUser?.fullName || 'Biriktirilmagan' },
    ...(isAdmin ? [{ title: 'Amal', width: 95, render: (asset) => <Button type="text" icon={<EditOutlined />} onClick={() => { setEditingAsset(asset); form.setFieldsValue({ status: asset.status }); }}>Holat</Button> }] : [])
  ];
  const ownAssets = department.assets || [];
  const childGroups = department.subDepartmentAssets || [];
  return <div className="department-detail">
    <Card className="department-hero" bordered={false}><div className="department-hero-icon"><BankOutlined /></div><div><Typography.Text className="asset-kicker">BO‘LIM KARTASI</Typography.Text><Typography.Title level={2}>{department.name}</Typography.Title><Typography.Text>{department.parent ? `Yuqori bo‘lim: ${department.parent.name}` : 'Asosiy bo‘lim'}</Typography.Text></div><div className="department-stat"><LaptopOutlined /><span><strong>{department.totalAssets}</strong>Jami qurilmalar</span></div></Card>
    <Card title="Bo‘limning o‘z qurilmalari" className="department-assets-card" extra={<Tag color="blue" icon={<ApartmentOutlined />}>{ownAssets.length} ta qurilma</Tag>}>{ownAssets.length ? <Table rowKey="id" dataSource={ownAssets} columns={assetColumns} scroll={{ x: 1000 }} pagination={{ pageSize: 8, showSizeChanger: false }} /> : <Empty description="Bu bo‘limning o‘ziga biriktirilgan qurilma yo‘q" image={Empty.PRESENTED_IMAGE_SIMPLE} />}</Card>
    {childGroups.length > 0 && <div className="subdepartment-list"><Typography.Title level={4}>Quyi bo‘limlardagi qurilmalar</Typography.Title>{childGroups.map((group) => <Card key={group.id} title={<Link to={`/departments/${group.id}`}><BankOutlined /> {group.name}</Link>} className="department-assets-card subdepartment-card" extra={<Tag color="green">{group.assets.length} ta qurilma</Tag>}><Table rowKey="id" dataSource={group.assets} columns={assetColumns} scroll={{ x: 1000 }} pagination={false} /></Card>)}</div>}
    <Modal title="Qurilma holatini o‘zgartirish" open={Boolean(editingAsset)} onCancel={() => { setEditingAsset(null); form.resetFields(); }} onOk={() => form.submit()} okText="Saqlash">
      <Form form={form} layout="vertical" onFinish={updateStatus}><Typography.Paragraph>{editingAsset?.name} — {editingAsset?.inventoryNumber}</Typography.Paragraph><Form.Item name="status" label="Holat" rules={[{ required: true }]}><Select options={[{ value: 'ACTIVE', label: 'Faol / foydalanishga tayyor' }, { value: 'BROKEN', label: 'Nosoz' }, { value: 'DISPOSED', label: 'Foydalanishdan chiqarilgan' }]} /></Form.Item></Form>
    </Modal>
  </div>;
}
