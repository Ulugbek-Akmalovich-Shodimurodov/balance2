import React from 'react';
import { BankOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';

export default function DepartmentsPage() {
  const [items, setItems] = useState([]); const [creating, setCreating] = useState(false); const [editing, setEditing] = useState(null);
  const [createForm] = Form.useForm(); const [editForm] = Form.useForm();
  const load = () => api.get('/departments').then((response) => setItems(response.data));
  useEffect(() => { load(); }, []);
  const parentOptions = (currentId) => items.filter((department) => department.id !== currentId).map((department) => ({ value:department.id, label:department.name }));
  const save = async (values, mode) => {
    try {
      const payload = { ...values, parentId: values.parentId || null };
      if (mode === 'create') await api.post('/departments', payload); else await api.put(`/departments/${editing.id}`, payload);
      message.success(mode === 'create' ? 'Bo‘lim yaratildi' : 'Bo‘lim yangilandi');
      setCreating(false); setEditing(null); createForm.resetFields(); editForm.resetFields(); load();
    } catch (error) { message.error(error.response?.data?.message || 'Bo‘limni saqlab bo‘lmadi'); }
  };
  const openEdit = (department) => { setEditing(department); editForm.setFieldsValue({ name:department.name, parentId:department.parent?.id }); };
  const remove = async (department) => { try { await api.delete(`/departments/${department.id}`); message.success('Bo‘lim o‘chirildi'); load(); } catch (error) { message.error(error.response?.data?.message || 'Bo‘limni o‘chirib bo‘lmadi. Unda qurilma yoki quyi bo‘limlar bo‘lishi mumkin.'); } };
  const fields = (form, currentId) => <><Form.Item name="name" label="Bo‘lim nomi" rules={[{ required:true, message:'Bo‘lim nomini kiriting' }]}><Input placeholder="Masalan: Axborot texnologiyalari"/></Form.Item><Form.Item name="parentId" label="Yuqori bo‘lim"><Select allowClear placeholder="Agar mavjud bo‘lsa, tanlang" options={parentOptions(currentId)}/></Form.Item></>;
  const columns = [{ title:'Bo‘lim', dataIndex:'name', render:(name,department) => <Link className="department-link" to={`/departments/${department.id}`}><BankOutlined /> {name}</Link> }, { title:'Yuqori bo‘lim', render:(department) => department.parent?.name || <Typography.Text type="secondary">Asosiy bo‘lim</Typography.Text> }, { title:'Jami qurilmalar', render:(department) => <Tag color="blue">{department.totalAssets || 0} ta qurilma</Tag> }, { title:'Quyi bo‘limlar', render:(department) => department.children?.length || 0 }, { title:'Amallar', width:120, render:(department) => <Space size="small"><Button type="text" icon={<EditOutlined />} onClick={() => openEdit(department)} aria-label="Tahrirlash"/><Popconfirm title="Bo‘lim o‘chirilsinmi?" description="Bo‘sh bo‘limni o‘chirish mumkin." okText="O‘chirish" cancelText="Bekor qilish" okButtonProps={{ danger:true }} onConfirm={() => remove(department)}><Button type="text" danger icon={<DeleteOutlined />} aria-label="O‘chirish"/></Popconfirm></Space> }];
  return <><Space className="page-head"><div><Typography.Title level={2}>Bo‘limlar</Typography.Title><Typography.Text type="secondary">Tashkilot bo‘limlari va ulardagi qurilmalarni boshqaring</Typography.Text></div><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Bo‘lim qo‘shish</Button></Space><Card className="department-table-card"><Table rowKey="id" dataSource={items} columns={columns} childrenColumnName="subDepartments" pagination={{ pageSize:10 }}/></Card><Modal title="Yangi bo‘lim" open={creating} onCancel={() => { setCreating(false); createForm.resetFields(); }} onOk={() => createForm.submit()} okText="Yaratish"><Form form={createForm} layout="vertical" onFinish={(values) => save(values,'create')}>{fields(createForm)}</Form></Modal><Modal title="Bo‘limni tahrirlash" open={Boolean(editing)} onCancel={() => { setEditing(null); editForm.resetFields(); }} onOk={() => editForm.submit()} okText="Saqlash"><Form form={editForm} layout="vertical" onFinish={(values) => save(values,'edit')}>{fields(editForm, editing?.id)}</Form></Modal></>;
}
