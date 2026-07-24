import React from 'react';
import { BankOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';

export default function DepartmentsPage() {
  const [items, setItems] = useState([]); const [creating, setCreating] = useState(false); const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState(''); const [levelFilter, setLevelFilter] = useState(); const [assetFilter, setAssetFilter] = useState();
  const [createForm] = Form.useForm(); const [editForm] = Form.useForm();
  const load = () => api.get('/departments').then((response) => setItems(response.data));
  useEffect(() => { load(); }, []);
  const parentOptions = (currentId) => items.filter((department) => department.id !== currentId).map((department) => ({ value:department.id, label:department.name }));
  const needle = search.trim().toLocaleLowerCase('uz');
  const filteredItems = useMemo(() => items.filter((department) => {
    const matchesSearch = !needle || [department.name, department.parent?.name].some((value) => value?.toLocaleLowerCase('uz').includes(needle));
    const matchesLevel = !levelFilter || (levelFilter === 'root' ? !department.parentId : Boolean(department.parentId));
    const matchesAssets = !assetFilter || (assetFilter === 'with-assets' ? department.totalAssets > 0 : !department.totalAssets);
    return matchesSearch && matchesLevel && matchesAssets;
  }), [items, needle, levelFilter, assetFilter]);
  const hasFilters = Boolean(search || levelFilter || assetFilter);
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
  return <><Space className="page-head"><div><Typography.Title level={2}>Bo‘limlar</Typography.Title><Typography.Text type="secondary">Tashkilot bo‘limlari va ulardagi qurilmalarni boshqaring</Typography.Text></div><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Bo‘lim qo‘shish</Button></Space><Card className="department-table-card"><Space direction="vertical" size="middle" style={{ width:'100%' }}><Space wrap><Input allowClear value={search} onChange={(event) => setSearch(event.target.value)} prefix={<SearchOutlined />} placeholder="Bo‘lim yoki yuqori bo‘lim nomi bo‘yicha qidirish" style={{ width:350, maxWidth:'100%' }}/><Select allowClear value={levelFilter} onChange={setLevelFilter} placeholder="Barcha darajalar" options={[{ value:'root', label:'Asosiy bo‘limlar' },{ value:'child', label:'Quyi bo‘limlar' }]} style={{ width:190 }}/><Select allowClear value={assetFilter} onChange={setAssetFilter} placeholder="Qurilma mavjudligi" options={[{ value:'with-assets', label:'Qurilmasi bor' },{ value:'empty', label:'Qurilmasi yo‘q' }]} style={{ width:190 }}/><Button icon={<ReloadOutlined />} disabled={!hasFilters} onClick={() => { setSearch(''); setLevelFilter(undefined); setAssetFilter(undefined); }}>Filtrlarni tozalash</Button></Space><Typography.Text type="secondary">{hasFilters ? `${filteredItems.length} ta natija topildi (jami ${items.length})` : `Jami ${items.length} ta bo‘lim`}</Typography.Text><Table rowKey="id" dataSource={filteredItems} columns={columns} childrenColumnName="subDepartments" pagination={{ defaultPageSize:10, showSizeChanger:true, pageSizeOptions:[10,20,50], showTotal:(total,range) => `${range[0]}–${range[1]} / ${total}` }} locale={{ emptyText:hasFilters ? 'Filtrlarga mos bo‘lim topilmadi' : 'Bo‘limlar mavjud emas' }}/></Space></Card><Modal title="Yangi bo‘lim" open={creating} onCancel={() => { setCreating(false); createForm.resetFields(); }} onOk={() => createForm.submit()} okText="Yaratish"><Form form={createForm} layout="vertical" onFinish={(values) => save(values,'create')}>{fields(createForm)}</Form></Modal><Modal title="Bo‘limni tahrirlash" open={Boolean(editing)} onCancel={() => { setEditing(null); editForm.resetFields(); }} onOk={() => editForm.submit()} okText="Saqlash"><Form form={editForm} layout="vertical" onFinish={(values) => save(values,'edit')}>{fields(editForm, editing?.id)}</Form></Modal></>;
}
