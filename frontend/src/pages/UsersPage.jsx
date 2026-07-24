import React, { useEffect, useMemo, useState } from 'react';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import SafeImage from '../components/SafeImage.jsx';

const roleOptions = [
  { value: 'ADMIN', label: 'Administrator' },
  { value: 'MANAGER', label: 'Menejer' },
  { value: 'TECHNICIAN', label: 'Texnik' },
  { value: 'VIEWER', label: 'Kuzatuvchi' },
];

const roleLabels = Object.fromEntries(roleOptions.map(({ value, label }) => [value, label]));
const roleColors = { ADMIN: 'red', MANAGER: 'blue', TECHNICIAN: 'gold', VIEWER: 'default' };

export default function UsersPage() {
  const [items, setItems] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState();
  const [departmentFilter, setDepartmentFilter] = useState();
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const load = () => api.get('/users').then((response) => setItems(response.data));

  useEffect(() => {
    load();
    api.get('/departments').then((response) => setDepartments(response.data));
  }, []);

  const departmentOptions = departments.map((department) => ({
    value: department.id,
    label: department.name,
  }));

  const normalizedSearch = search.trim().toLocaleLowerCase('uz');
  const filteredItems = useMemo(() => items.filter((user) => {
    const matchesSearch = !normalizedSearch || [
      user.fullName,
      user.login,
      user.phone,
      user.department?.name,
    ].some((value) => value?.toLocaleLowerCase('uz').includes(normalizedSearch));
    const matchesRole = !roleFilter || user.role === roleFilter;
    const matchesDepartment = !departmentFilter
      || (departmentFilter === 'unassigned'
        ? !user.department
        : user.department?.id === departmentFilter);

    return matchesSearch && matchesRole && matchesDepartment;
  }), [items, normalizedSearch, roleFilter, departmentFilter]);

  const hasFilters = Boolean(search || roleFilter || departmentFilter);
  const resetFilters = () => {
    setSearch('');
    setRoleFilter(undefined);
    setDepartmentFilter(undefined);
  };

  const uploadImage = (form) => async ({ file, onSuccess, onError }) => {
    const body = new FormData();
    body.append('image', file);
    try {
      const response = await api.post('/assets/upload-image', body);
      form.setFieldValue('imageUrl', response.data.imageUrl);
      onSuccess?.(response.data);
      message.success('Rasm yuklandi');
    } catch (error) {
      onError?.(error);
      message.error(error.response?.data?.message || 'Rasmni yuklab bo‘lmadi');
    }
  };

  const imageUpload = (form) => (
    <Upload
      accept="image/*"
      maxCount={1}
      customRequest={uploadImage(form)}
      showUploadList={{ showRemoveIcon: false }}
    >
      <Button icon={<UploadOutlined />}>Rasm tanlash</Button>
    </Upload>
  );

  const save = async (values, mode) => {
    try {
      if (mode === 'create') await api.post('/users', values);
      else await api.put(`/users/${editing.id}`, values);
      message.success(mode === 'create' ? 'Xodim yaratildi' : 'Xodim yangilandi');
      setCreating(false);
      setEditing(null);
      createForm.resetFields();
      editForm.resetFields();
      load();
    } catch (error) {
      message.error(error.response?.data?.message || 'Ma’lumotni saqlab bo‘lmadi');
    }
  };

  const openEdit = (user) => {
    setEditing(user);
    editForm.setFieldsValue({
      fullName: user.fullName,
      login: user.login,
      phone: user.phone,
      role: user.role,
      departmentId: user.department?.id,
      imageUrl: user.imageUrl,
    });
  };

  const remove = async (user) => {
    try {
      await api.delete(`/users/${user.id}`);
      message.success('Xodim o‘chirildi');
      load();
    } catch (error) {
      message.error(error.response?.data?.message || 'Xodimni o‘chirib bo‘lmadi');
    }
  };

  const fields = (form, isCreate) => (
    <>
      <Form.Item name="fullName" label="Ism-familiya" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="login" label="Login" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item
        name="password"
        label={isCreate ? 'Parol' : 'Yangi parol'}
        rules={isCreate ? [{ required: true }] : []}
      >
        <Input.Password placeholder={isCreate ? '' : 'O‘zgartirmaslik uchun bo‘sh qoldiring'} />
      </Form.Item>
      <Form.Item name="phone" label="Telefon raqam">
        <Input placeholder="+998 90 123 45 67" />
      </Form.Item>
      <Form.Item name="role" label="Rol" initialValue="VIEWER" rules={[{ required: true }]}>
        <Select options={roleOptions} />
      </Form.Item>
      <Form.Item name="departmentId" label="Bo‘lim">
        <Select allowClear options={departmentOptions} />
      </Form.Item>
      <Form.Item name="imageUrl" hidden>
        <Input />
      </Form.Item>
      <Form.Item label="Rasm">{imageUpload(form)}</Form.Item>
    </>
  );

  const columns = [
    {
      title: 'Rasm',
      dataIndex: 'imageUrl',
      width: 72,
      render: (url) => <SafeImage src={url} width={42} height={42} rounded user />,
    },
    { title: 'ID', dataIndex: 'id', width: 70 },
    {
      title: 'Ism-familiya',
      dataIndex: 'fullName',
      sorter: (a, b) => a.fullName.localeCompare(b.fullName),
      render: (name, user) => <Link to={`/users/${user.id}`}>{name}</Link>,
    },
    { title: 'Login', dataIndex: 'login' },
    { title: 'Telefon', dataIndex: 'phone', render: (phone) => phone || '—' },
    {
      title: 'Rol',
      dataIndex: 'role',
      render: (role) => <Tag color={roleColors[role]}>{roleLabels[role] || role}</Tag>,
    },
    { title: 'Bo‘lim', render: (user) => user.department?.name || '—' },
    {
      title: 'Amallar',
      width: 118,
      render: (user) => (
        <Space size="small">
          <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(user)} aria-label="Tahrirlash" />
          <Popconfirm
            title="Xodim o‘chirilsinmi?"
            description="Bu amalni qaytarib bo‘lmaydi."
            okText="O‘chirish"
            cancelText="Bekor qilish"
            okButtonProps={{ danger: true }}
            onConfirm={() => remove(user)}
          >
            <Button type="text" danger icon={<DeleteOutlined />} aria-label="O‘chirish" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space className="page-head">
        <div>
          <Typography.Title level={2}>Foydalanuvchilar</Typography.Title>
          <Typography.Text type="secondary">
            Xodimlar va ularning tizimdagi rollarini boshqaring
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
          Xodim qo‘shish
        </Button>
      </Space>

      <Card>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap style={{ width: '100%' }}>
            <Input
              allowClear
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              prefix={<SearchOutlined />}
              placeholder="Ism, login, telefon yoki bo‘lim bo‘yicha qidirish"
              style={{ width: 360, maxWidth: '100%' }}
            />
            <Select
              allowClear
              value={roleFilter}
              onChange={setRoleFilter}
              placeholder="Barcha rollar"
              options={roleOptions}
              style={{ width: 180 }}
            />
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              value={departmentFilter}
              onChange={setDepartmentFilter}
              placeholder="Barcha bo‘limlar"
              options={[
                ...departmentOptions,
                { value: 'unassigned', label: 'Bo‘lim biriktirilmagan' },
              ]}
              style={{ width: 220 }}
            />
            <Button icon={<ReloadOutlined />} onClick={resetFilters} disabled={!hasFilters}>
              Filtrlarni tozalash
            </Button>
          </Space>

          <Typography.Text type="secondary">
            {hasFilters
              ? `${filteredItems.length} ta natija topildi (jami ${items.length})`
              : `Jami ${items.length} ta foydalanuvchi`}
          </Typography.Text>

          <Table
            rowKey="id"
            dataSource={filteredItems}
            columns={columns}
            scroll={{ x: 1050 }}
            pagination={{
              defaultPageSize: 10,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50],
              showTotal: (total, range) => `${range[0]}–${range[1]} / ${total}`,
            }}
            locale={{
              emptyText: hasFilters
                ? 'Filtrlarga mos foydalanuvchi topilmadi'
                : 'Foydalanuvchilar mavjud emas',
            }}
          />
        </Space>
      </Card>

      <Modal
        title="Yangi xodim"
        open={creating}
        onCancel={() => { setCreating(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        okText="Yaratish"
      >
        <Form form={createForm} layout="vertical" onFinish={(values) => save(values, 'create')}>
          {fields(createForm, true)}
        </Form>
      </Modal>

      <Modal
        title="Xodimni tahrirlash"
        open={Boolean(editing)}
        onCancel={() => { setEditing(null); editForm.resetFields(); }}
        onOk={() => editForm.submit()}
        okText="Saqlash"
      >
        <Form form={editForm} layout="vertical" onFinish={(values) => save(values, 'edit')}>
          {fields(editForm, false)}
        </Form>
      </Modal>
    </>
  );
}
