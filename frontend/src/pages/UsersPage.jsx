import React from 'react';
import { DeleteOutlined, EditOutlined, PlusOutlined, UploadOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Button, Card, Form, Image, Input, Modal, Popconfirm, Select, Space, Table, Typography, Upload, message } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';

export default function UsersPage() {
  const [items, setItems] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const load = () => api.get('/users').then((response) => setItems(response.data));
  useEffect(() => { load(); api.get('/departments').then((response) => setDepartments(response.data)); }, []);
  const departmentOptions = departments.map((department) => ({ value: department.id, label: department.name }));

  const uploadImage = (form) => async ({ file, onSuccess, onError }) => {
    const body = new FormData(); body.append('image', file);
    try { const response = await api.post('/assets/upload-image', body); form.setFieldValue('imageUrl', response.data.imageUrl); onSuccess?.(response.data); message.success('Rasm yuklandi'); }
    catch (error) { onError?.(error); message.error(error.response?.data?.message || 'Rasmni yuklab bo‘lmadi'); }
  };
  const imageUpload = (form) => <Upload accept="image/*" maxCount={1} customRequest={uploadImage(form)} showUploadList={{ showRemoveIcon: false }}><Button icon={<UploadOutlined />}>Rasm tanlash</Button></Upload>;
  const save = async (values, mode) => {
    try {
      if (mode === 'create') await api.post('/users', values); else await api.put(`/users/${editing.id}`, values);
      message.success(mode === 'create' ? 'Xodim yaratildi' : 'Xodim yangilandi');
      setCreating(false); setEditing(null); createForm.resetFields(); editForm.resetFields(); load();
    } catch (error) { message.error(error.response?.data?.message || 'Ma’lumotni saqlab bo‘lmadi'); }
  };
  const openEdit = (user) => { setEditing(user); editForm.setFieldsValue({ fullName:user.fullName, login:user.login, phone:user.phone, role:user.role, departmentId:user.department?.id, imageUrl:user.imageUrl }); };
  const remove = async (user) => { try { await api.delete(`/users/${user.id}`); message.success('Xodim o‘chirildi'); load(); } catch (error) { message.error(error.response?.data?.message || 'Xodimni o‘chirib bo‘lmadi'); } };
  const fields = (form, isCreate) => <><Form.Item name="fullName" label="Ism-familiya" rules={[{ required:true }]}><Input/></Form.Item><Form.Item name="login" label="Login" rules={[{ required:true }]}><Input/></Form.Item><Form.Item name="password" label={isCreate ? 'Parol' : 'Yangi parol'} rules={isCreate ? [{ required:true }] : []}><Input.Password placeholder={isCreate ? '' : 'O‘zgartirmaslik uchun bo‘sh qoldiring'}/></Form.Item><Form.Item name="phone" label="Telefon raqam"><Input placeholder="+998 90 123 45 67"/></Form.Item><Form.Item name="role" label="Rol" initialValue="VIEWER" rules={[{ required:true }]}><Select options={['ADMIN','MANAGER','TECHNICIAN','VIEWER'].map((role) => ({ value:role, label:role }))}/></Form.Item><Form.Item name="departmentId" label="Bo‘lim"><Select allowClear options={departmentOptions}/></Form.Item><Form.Item name="imageUrl" hidden><Input/></Form.Item><Form.Item label="Rasm">{imageUpload(form)}</Form.Item></>;
  const columns = [
    { title:'Rasm', dataIndex:'imageUrl', width:72, render:(url) => url ? <Image src={url} width={42} height={42} preview={false} style={{ objectFit:'cover', borderRadius:'50%' }}/> : <Avatar icon={<UserOutlined />}/> },
    { title:'ID', dataIndex:'id', width:70 }, { title:'Ism-familiya', dataIndex:'fullName', render:(name,user) => <Link to={`/users/${user.id}`}>{name}</Link> }, { title:'Login', dataIndex:'login' }, { title:'Telefon', dataIndex:'phone', render:(phone) => phone || '—' }, { title:'Rol', dataIndex:'role' }, { title:'Bo‘lim', render:(user) => user.department?.name || '—' },
    { title:'Amallar', width:118, render:(user) => <Space size="small"><Button type="text" icon={<EditOutlined />} onClick={() => openEdit(user)} aria-label="Tahrirlash"/><Popconfirm title="Xodim o‘chirilsinmi?" description="Bu amalni qaytarib bo‘lmaydi." okText="O‘chirish" cancelText="Bekor qilish" okButtonProps={{ danger:true }} onConfirm={() => remove(user)}><Button type="text" danger icon={<DeleteOutlined />} aria-label="O‘chirish"/></Popconfirm></Space> },
  ];
  return <><Space className="page-head"><div><Typography.Title level={2}>Foydalanuvchilar</Typography.Title><Typography.Text type="secondary">Xodimlar va ularning tizimdagi rollarini boshqaring</Typography.Text></div><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Xodim qo‘shish</Button></Space><Card><Table rowKey="id" dataSource={items} columns={columns} scroll={{ x:1050 }}/></Card><Modal title="Yangi xodim" open={creating} onCancel={() => { setCreating(false); createForm.resetFields(); }} onOk={() => createForm.submit()} okText="Yaratish"><Form form={createForm} layout="vertical" onFinish={(values) => save(values, 'create')}>{fields(createForm, true)}</Form></Modal><Modal title="Xodimni tahrirlash" open={Boolean(editing)} onCancel={() => { setEditing(null); editForm.resetFields(); }} onOk={() => editForm.submit()} okText="Saqlash"><Form form={editForm} layout="vertical" onFinish={(values) => save(values, 'edit')}>{fields(editForm, false)}</Form></Modal></>;
}
