import React, { useEffect, useMemo, useState } from 'react';
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined, TeamOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
import { api } from '../api/client.js';
import { useSelector } from 'react-redux';

export default function PositionsPage({ embedded = false }) {
  const currentUser = useSelector((state) => state.auth.user);
  const canManageStructure = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser?.role);
  const [items, setItems] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [organizationFilter, setOrganizationFilter] = useState();
  const [form] = Form.useForm();
  const selectedOrganizationId = Form.useWatch('organizationId', form);

  const load = async () => {
    const [positionResponse, organizationResponse, departmentResponse] = await Promise.all([
      api.get('/positions'), api.get('/organizations'), api.get('/departments'),
    ]);
    setItems(positionResponse.data);
    setOrganizations(organizationResponse.data);
    setDepartments(departmentResponse.data);
  };
  useEffect(() => { load(); }, []);

  const organizationOptions = organizations.map((item) => ({ value: item.id, label: item.name }));
  const departmentOptions = departments
    .filter((item) => item.organizationId === selectedOrganizationId)
    .map((item) => ({ value: item.id, label: item.name }));
  const filteredItems = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('uz');
    return items.filter((item) => (
      (!needle || item.name.toLocaleLowerCase('uz').includes(needle))
      && (!organizationFilter || item.organizationId === organizationFilter)
    ));
  }, [items, search, organizationFilter]);

  const closeModal = () => { setModalOpen(false); setEditing(null); form.resetFields(); };
  const openEdit = (item) => {
    setEditing(item);
    form.setFieldsValue({
      name: item.name,
      organizationId: item.organizationId,
      departmentIds: item.departmentPositions.map((assignment) => assignment.departmentId),
    });
    setModalOpen(true);
  };

  const save = async (values) => {
    try {
      if (editing) {
        await api.put(`/positions/${editing.id}`, values);
      } else await api.post('/positions', values);
      message.success(editing ? 'Lavozim yangilandi' : 'Lavozim yaratildi');
      closeModal();
      load();
    } catch (error) {
      message.error(error.response?.data?.message || 'Lavozimni saqlab bo‘lmadi');
    }
  };

  const remove = async (item) => {
    try {
      await api.delete(`/positions/${item.id}`);
      message.success('Lavozim o‘chirildi');
      load();
    } catch (error) {
      message.error(error.response?.data?.message || 'Lavozimni o‘chirib bo‘lmadi');
    }
  };

  const employeeCount = (item) => item.departmentPositions.reduce((sum, assignment) => sum + (assignment._count?.users || 0), 0);
  const columns = [
    { title: 'Lavozim turi', dataIndex: 'name', render: (name) => <Space><TeamOutlined />{name}</Space> },
    { title: 'Tashkilot', render: (item) => item.organization?.name || '—' },
    {
      title: 'Biriktirilgan bo‘limlar',
      render: (item) => <Space wrap>{item.departmentPositions.length
        ? item.departmentPositions.map((assignment) => <Tag key={assignment.id} color="cyan">{assignment.department.name}</Tag>)
        : <Typography.Text type="secondary">Biriktirilmagan</Typography.Text>}</Space>,
    },
    { title: 'Xodimlar', width: 130, render: (item) => <Tag color="blue">{employeeCount(item)} ta</Tag> },
    {
      title: 'Amallar', width: 120, render: (item) => <Space>
        <Button type="text" icon={<EditOutlined />} onClick={() => openEdit(item)} aria-label="Tahrirlash" />
        <Popconfirm title="Lavozim o‘chirilsinmi?" description="Xodim biriktirilgan lavozimni o‘chirib bo‘lmaydi." okText="O‘chirish" cancelText="Bekor qilish" okButtonProps={{ danger: true }} onConfirm={() => remove(item)}><Button type="text" danger icon={<DeleteOutlined />} aria-label="O‘chirish" /></Popconfirm>
      </Space>,
    },
  ];
  const visibleColumns = canManageStructure ? columns : columns.filter((column) => column.title !== 'Amallar');

  return <>
    {!embedded && <Space className="page-head"><Typography.Title level={2}>Lavozim turlari</Typography.Title>{canManageStructure && <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Lavozim yaratish</Button>}</Space>}
    <Card
      variant={embedded ? 'borderless' : undefined}
      title={embedded ? <Typography.Title level={4}>Lavozimlar</Typography.Title> : undefined}
      extra={embedded && canManageStructure ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Lavozim yaratish</Button> : undefined}
    ><Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap>
        <Input allowClear value={search} onChange={(event) => setSearch(event.target.value)} prefix={<SearchOutlined />} placeholder="Lavozim bo‘yicha qidirish" style={{ width: 320 }} />
        <Select allowClear value={organizationFilter} onChange={setOrganizationFilter} placeholder="Barcha tashkilotlar" options={organizationOptions} style={{ width: 260 }} />
      </Space>
      <Table rowKey="id" dataSource={filteredItems} columns={visibleColumns} scroll={{ x: 900 }} />
    </Space></Card>
    <Modal title={editing ? 'Lavozimni tahrirlash' : 'Yangi lavozim turi'} open={modalOpen} onCancel={closeModal} onOk={() => form.submit()} okText="Saqlash">
      <Form form={form} layout="vertical" onFinish={save}>
        <Form.Item name="organizationId" label="Tashkilot" rules={[{ required: true, message: 'Tashkilotni tanlang' }]}>
          <Select showSearch optionFilterProp="label" options={organizationOptions} onChange={() => form.setFieldValue('departmentIds', [])} />
        </Form.Item>
        <Form.Item name="name" label="Lavozim nomi" rules={[{ required: true }, { min: 2, max: 120 }]}>
          <Input placeholder="Masalan: Yetakchi mutaxassis" maxLength={120} />
        </Form.Item>
        <Form.Item name="departmentIds" label="Biriktiriladigan bo‘limlar">
          <Select mode="multiple" showSearch optionFilterProp="label" disabled={!selectedOrganizationId} options={departmentOptions} placeholder="Bir yoki bir nechta bo‘limni tanlang" />
        </Form.Item>
      </Form>
    </Modal>
  </>;
}
