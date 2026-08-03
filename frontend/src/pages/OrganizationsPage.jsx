import React, { useEffect, useState } from 'react';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Modal, Popconfirm, Space, Table, Tag, Typography, message } from 'antd';
import { api } from '../api/client.js';
import { useSelector } from 'react-redux';

export default function OrganizationsPage({ embedded = false }) {
  const currentUser = useSelector((state) => state.auth.user);
  const isSuperAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser?.role);
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const load = () => api.get('/organizations').then((response) => setItems(response.data));
  useEffect(() => { load(); }, []);
  const close = () => { setOpen(false); setEditing(null); form.resetFields(); };
  const save = async (values) => {
    try {
      if (editing) await api.put(`/organizations/${editing.id}`, values);
      else await api.post('/organizations', values);
      message.success(editing ? 'Tashkilot yangilandi' : 'Tashkilot yaratildi');
      close(); load();
    } catch (error) { message.error(error.response?.data?.message || 'Tashkilotni saqlab bo‘lmadi'); }
  };
  const remove = async (item) => {
    try { await api.delete(`/organizations/${item.id}`); message.success('Tashkilot o‘chirildi'); load(); }
    catch (error) { message.error(error.response?.data?.message || 'Tashkilotni o‘chirib bo‘lmadi'); }
  };
  const columns = [
    { title: 'Tashkilot nomi', dataIndex: 'name' },
    { title: 'Bo‘limlar', render: (item) => <Tag color="blue">{item._count?.departments || 0} ta</Tag> },
    { title: 'Lavozim turlari', render: (item) => <Tag color="cyan">{item._count?.positions || 0} ta</Tag> },
    { title: 'Amallar', width: 120, render: (item) => <Space><Button type="text" icon={<EditOutlined />} onClick={() => { setEditing(item); form.setFieldsValue({ name: item.name }); setOpen(true); }} />{isSuperAdmin && <Popconfirm title="Tashkilot o‘chirilsinmi?" description="Faqat bo‘lim va lavozimlari bo‘lmagan tashkilotni o‘chirish mumkin." onConfirm={() => remove(item)}><Button type="text" danger icon={<DeleteOutlined />} /></Popconfirm>}</Space> },
  ];
  return <>
    {!embedded && <Space className="page-head"><Typography.Title level={2}>Tashkilotlar</Typography.Title>{isSuperAdmin && <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Tashkilot yaratish</Button>}</Space>}
    <Card
      variant={embedded ? 'borderless' : undefined}
      title={embedded ? <Typography.Title level={4}>Tashkilotlar</Typography.Title> : undefined}
      extra={embedded && isSuperAdmin ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Tashkilot yaratish</Button> : undefined}
    ><Table rowKey="id" dataSource={items} columns={columns} /></Card>
    <Modal title={editing ? 'Tashkilotni tahrirlash' : 'Yangi tashkilot'} open={open} onCancel={close} onOk={() => form.submit()} okText="Saqlash"><Form form={form} layout="vertical" onFinish={save}><Form.Item name="name" label="Tashkilot nomi" rules={[{ required: true, message: 'Tashkilot nomini kiriting' }, { min: 2, max: 160 }]}><Input maxLength={160} /></Form.Item></Form></Modal>
  </>;
}
