import React, { useEffect, useState } from 'react';
import { PlusOutlined, ToolOutlined } from '@ant-design/icons';
import { Button, Card, Form, Image, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';

const labels = { NEW: 'Yangi so‘rov', IN_PROGRESS: 'Jarayonda', REPAIRED: 'Tuzatildi', REPLACED: 'Almashtirildi', WAREHOUSED: 'Omborxonada' };
const colors = { NEW: 'red', IN_PROGRESS: 'orange', REPAIRED: 'green', REPLACED: 'blue', WAREHOUSED: 'purple' };

export default function MaintenancePage() {
  const user = useSelector((state) => state.auth.user);
  const isAdmin = user?.role === 'ADMIN';
  const [items, setItems] = useState([]);
  const [assets, setAssets] = useState([]);
  const [warehouse, setWarehouse] = useState([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [actionItem, setActionItem] = useState(null);
  const [reportForm] = Form.useForm();
  const [actionForm] = Form.useForm();
  const status = Form.useWatch('status', actionForm);

  const load = () => {
    api.get('/maintenance').then((response) => setItems(response.data));
    if (isAdmin) api.get('/maintenance/warehouse-assets').then((response) => setWarehouse(response.data));
    else api.get('/assets', { params: { limit: 100 } }).then((response) => setAssets(response.data.items));
  };

  useEffect(() => { load(); }, [isAdmin]);

  const report = async (values) => {
    try {
      await api.post('/maintenance/report', values);
      message.success('Adminlarga xabar yuborildi');
      setReportOpen(false);
      reportForm.resetFields();
      load();
    } catch (error) { message.error(error.response?.data?.message || 'So‘rov yuborilmadi'); }
  };

  const action = async (values) => {
    try {
      await api.post(`/maintenance/${actionItem.id}/action`, values);
      message.success('Holat yangilandi');
      setActionItem(null);
      actionForm.resetFields();
      load();
    } catch (error) { message.error(error.response?.data?.message || 'Amal bajarilmadi'); }
  };

  const columns = [
    { title: 'Rasm', width: 70, render: (row) => row.asset?.imageUrl ? <Image src={row.asset.imageUrl} width={42} height={42} preview={false} style={{ objectFit: 'cover', borderRadius: 6 }} /> : <span>—</span> },
    { title: 'Qurilma', width: 150, render: (row) => row.asset ? <Link to={`/assets/${row.asset.id}`}>{row.asset.name}</Link> : '—' },
    { title: 'Model', width: 160, render: (row) => row.asset?.model || '—' },
    { title: 'Inventar raqami', width: 145, render: (row) => row.asset?.inventoryNumber || '—' },
    { title: 'Seria raqami', width: 135, render: (row) => row.asset?.serialNumber || '—' },
    { title: 'Bo‘lim', width: 130, render: (row) => row.asset?.department?.name || '—' },
    { title: 'Foydalanuvchi', width: 155, render: (row) => row.asset?.assignedUser?.fullName || 'Biriktirilmagan' },
    { title: 'Qurilma holati', width: 125, render: (row) => <Tag color={row.asset?.status === 'BROKEN' ? 'gold' : row.asset?.status === 'DISPOSED' ? 'red' : 'green'}>{row.asset?.status === 'BROKEN' ? 'Nosoz' : row.asset?.status === 'DISPOSED' ? 'Chiqarilgan' : 'Faol'}</Tag> },
    { title: 'Muammo', dataIndex: 'title' },
    { title: 'Holat', render: (row) => <Tag color={colors[row.status || 'NEW']}>{labels[row.status || 'NEW']}</Tag> },
    { title: 'Sana', dataIndex: 'createdAt', render: (date) => new Date(date).toLocaleString('uz-UZ') },
    ...(isAdmin ? [{ title: 'Amal', render: (row) => <Button type="link" icon={<ToolOutlined />} onClick={() => { setActionItem(row); actionForm.setFieldsValue({ status: row.status || 'NEW', replacementAssetId: null }); }}>Boshqarish</Button> }] : [])
  ];

  const warehouseOptions = warehouse.map((asset) => {
    const unavailableReason = asset.status !== 'ACTIVE'
      ? 'nosoz'
      : asset.assignedUserId
        ? `${asset.assignedUser?.fullName || 'xodimga'} biriktirilgan`
        : 'almashtirishga tayyor';
    return {
      value: asset.id,
      label: `${asset.name} | ${asset.model || '—'} | ${asset.inventoryNumber} — ${unavailableReason}`,
      disabled: asset.status !== 'ACTIVE' || Boolean(asset.assignedUserId)
    };
  });

  return <>
    <Space className="page-head">
      <div>
        <Typography.Title level={2}>Texnik xizmat</Typography.Title>
        <Typography.Text type="secondary">{isAdmin ? 'Nosozlikdan yechimgacha jarayon' : 'Qurilmangizdagi nosozlik haqida xabar bering'}</Typography.Text>
      </div>
      {!isAdmin && <Button type="primary" icon={<PlusOutlined />} onClick={() => setReportOpen(true)}>Nosozlik haqida xabar berish</Button>}
    </Space>
    <Card><Table rowKey="id" dataSource={items} columns={columns} scroll={{ x: 1500 }} /></Card>
    <Modal title="Nosozlik haqida xabar berish" open={reportOpen} onCancel={() => setReportOpen(false)} onOk={() => reportForm.submit()}>
      <Form form={reportForm} layout="vertical" onFinish={report}>
        <Form.Item name="assetId" label="Qurilma" rules={[{ required: true }]}><Select options={assets.map((asset) => ({ value: asset.id, label: `${asset.name} — ${asset.inventoryNumber}` }))} /></Form.Item>
        <Form.Item name="title" label="Muammo" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="description" label="Tavsif"><Input.TextArea rows={4} /></Form.Item>
      </Form>
    </Modal>
    <Modal title="Texnik xizmatni boshqarish" open={Boolean(actionItem)} onCancel={() => setActionItem(null)} onOk={() => actionForm.submit()} okText="Saqlash">
      <Form form={actionForm} layout="vertical" onFinish={action}>
        <Form.Item name="status" label="Jarayon bosqichi" rules={[{ required: true }]}>
          <Select options={[{ value: 'IN_PROGRESS', label: 'Diagnostika / jarayonda' }, { value: 'REPAIRED', label: 'Tuzatildi' }, { value: 'REPLACED', label: 'Almashtirildi' }, { value: 'WAREHOUSED', label: 'Omborxonaga qabul qilish' }]} />
        </Form.Item>
        {status === 'REPLACED' && <Form.Item name="replacementAssetId" label="Omborxonadagi almashtiruvchi qurilma" rules={[{ required: true, message: 'Qurilmani tanlang' }]}>
          <Select showSearch optionFilterProp="label" placeholder="Omborxonadan qurilma tanlang" options={warehouseOptions} />
        </Form.Item>}
        <Form.Item name="resolutionNote" label="Bajarilgan ishlar / izoh"><Input.TextArea rows={4} /></Form.Item>
      </Form>
    </Modal>
  </>;
}
