import React, { useEffect, useMemo, useState } from 'react';
import { BankOutlined, DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { api } from '../api/client.js';

export default function DepartmentsPage({ embedded = false }) {
  const currentUser = useSelector((state) => state.auth.user);
  const canManageStructure = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser?.role);
  const [items, setItems] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [organizationFilter, setOrganizationFilter] = useState();
  const [form] = Form.useForm();
  const selectedOrganizationId = Form.useWatch('organizationId', form);

  const load = async () => {
    const [departmentResponse, organizationResponse] = await Promise.all([api.get('/departments'), api.get('/organizations')]);
    setItems(departmentResponse.data);
    setOrganizations(organizationResponse.data);
  };
  useEffect(() => { load(); }, []);

  const organizationOptions = organizations.map((item) => ({ value: item.id, label: item.name }));
  const parentOptions = items
    .filter((item) => item.organizationId === selectedOrganizationId && item.id !== editing?.id)
    .map((item) => ({ value: item.id, label: item.name }));
  const filteredItems = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('uz');
    return items.filter((item) => (
      (!needle || [item.name, item.parent?.name, item.organization?.name].some((value) => value?.toLocaleLowerCase('uz').includes(needle)))
      && (!organizationFilter || item.organizationId === organizationFilter)
    ));
  }, [items, search, organizationFilter]);

  const close = () => { setOpen(false); setEditing(null); form.resetFields(); };
  const save = async (values) => {
    try {
      const payload = { ...values, parentId: values.parentId || null };
      if (editing) await api.put(`/departments/${editing.id}`, payload);
      else await api.post('/departments', payload);
      message.success(editing ? 'Bo‘lim yangilandi' : 'Bo‘lim yaratildi');
      close(); load();
    } catch (error) { message.error(error.response?.data?.message || 'Bo‘limni saqlab bo‘lmadi'); }
  };
  const remove = async (item) => {
    try { await api.delete(`/departments/${item.id}`); message.success('Bo‘lim o‘chirildi'); load(); }
    catch (error) { message.error(error.response?.data?.message || 'Bo‘limni o‘chirib bo‘lmadi. Bog‘langan ma’lumotlar mavjud bo‘lishi mumkin.'); }
  };
  const columns = [
    { title: 'Tashkilot', render: (item) => item.organization?.name || '—' },
    { title: 'Bo‘lim', dataIndex: 'name', render: (name, item) => <Link to={`/departments/${item.id}`}><BankOutlined /> {name}</Link> },
    { title: 'Yuqori bo‘lim', render: (item) => item.parent?.name || '—' },
    { title: 'Lavozimlar', render: (item) => <Tag color="cyan">{item._count?.departmentPositions || 0} ta</Tag> },
    { title: 'Xodimlar', render: (item) => <Tag color="blue">{item._count?.users || 0} ta</Tag> },
    { title: 'Qurilmalar', render: (item) => <Tag>{item.totalAssets || 0} ta</Tag> },
    { title: 'Amallar', width: 120, render: (item) => <Space><Button type="text" icon={<EditOutlined />} onClick={() => { setEditing(item); form.setFieldsValue({ name: item.name, organizationId: item.organizationId, parentId: item.parentId }); setOpen(true); }} /><Popconfirm title="Bo‘lim o‘chirilsinmi?" description="Faqat bog‘langan ma’lumotlari bo‘lmagan bo‘limni o‘chirish mumkin." onConfirm={() => remove(item)}><Button type="text" danger icon={<DeleteOutlined />} /></Popconfirm></Space> },
  ];
  const visibleColumns = canManageStructure ? columns : columns.filter((column) => column.title !== 'Amallar');

  return <>
    {!embedded && <Space className="page-head"><Typography.Title level={2}>Bo‘limlar</Typography.Title>{canManageStructure && <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Bo‘lim yaratish</Button>}</Space>}
    <Card
      variant={embedded ? 'borderless' : undefined}
      title={embedded ? <Typography.Title level={4}>Bo‘limlar</Typography.Title> : undefined}
      extra={embedded && canManageStructure ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Bo‘lim yaratish</Button> : undefined}
    ><Space direction="vertical" size="middle" style={{ width: '100%' }}><Space wrap><Input allowClear value={search} onChange={(event) => setSearch(event.target.value)} prefix={<SearchOutlined />} placeholder="Tashkilot yoki bo‘lim bo‘yicha qidirish" style={{ width: 330 }} /><Select allowClear value={organizationFilter} onChange={setOrganizationFilter} placeholder="Barcha tashkilotlar" options={organizationOptions} style={{ width: 260 }} /></Space><Table rowKey="id" dataSource={filteredItems} columns={visibleColumns} scroll={{ x: 1000 }} /></Space></Card>
    <Modal title={editing ? 'Bo‘limni tahrirlash' : 'Yangi bo‘lim'} open={open} onCancel={close} onOk={() => form.submit()} okText="Saqlash"><Form form={form} layout="vertical" onFinish={save}><Form.Item name="organizationId" label="Tashkilot" rules={[{ required: true, message: 'Tashkilotni tanlang' }]}><Select showSearch optionFilterProp="label" options={organizationOptions} onChange={() => form.setFieldValue('parentId', undefined)} /></Form.Item><Form.Item name="name" label="Bo‘lim nomi" rules={[{ required: true, message: 'Bo‘lim nomini kiriting' }]}><Input maxLength={160} /></Form.Item><Form.Item name="parentId" label="Yuqori bo‘lim"><Select allowClear showSearch optionFilterProp="label" options={parentOptions} /></Form.Item></Form></Modal>
  </>;
}
