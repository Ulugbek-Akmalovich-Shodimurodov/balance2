import React, { useEffect, useState } from 'react';
import { CheckCircleFilled, DeleteOutlined, EditOutlined, ExclamationCircleFilled, MinusCircleOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, StopFilled, UploadOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Typography, Upload, message } from 'antd';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import SafeImage from '../components/SafeImage.jsx';

const statusOptions = [
  { value: 'ACTIVE', label: 'Faol / foydalanishga tayyor' },
  { value: 'BROKEN', label: 'Nosoz' },
  { value: 'DISPOSED', label: 'Foydalanishdan chiqarilgan' }
];

const statusMeta = {
  ACTIVE: { label: 'Faol', icon: CheckCircleFilled, className: 'asset-status-active' },
  BROKEN: { label: 'Nosoz', icon: ExclamationCircleFilled, className: 'asset-status-broken' },
  DISPOSED: { label: 'Foydalanishdan chiqarilgan', icon: StopFilled, className: 'asset-status-disposed' }
};

const AssetStatus = ({ status }) => {
  const item = statusMeta[status] || { label: status || 'Noma’lum', icon: ExclamationCircleFilled, className: 'asset-status-unknown' };
  const Icon = item.icon;
  return <span className={`asset-status-pill ${item.className}`}><Icon />{item.label}</span>;
};

export default function AssetsPage() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [assetTypes, setAssetTypes] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [filters, setFilters] = useState({ page: 1, limit: 10 });
  const [searchInput, setSearchInput] = useState('');
  const [baseInventory, setBaseInventory] = useState('');
  const createDepartmentId = Form.useWatch('departmentId', createForm);
  const editDepartmentId = Form.useWatch('departmentId', editForm);

  const load = () => api.get('/assets', { params: filters }).then((response) => setData(response.data));
  useEffect(() => { load(); }, [filters]);
  useEffect(() => {
    api.get('/users').then((response) => setUsers(response.data));
    api.get('/departments').then((response) => setDepartments(response.data));
    api.get('/assets/types').then((response) => setAssetTypes(response.data));
  }, []);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setFilters((current) => ({ ...current, search: searchInput.trim() || undefined, page: 1 }));
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const departmentById = (id) => departments.find((department) => department.id === id);
  const isWarehouse = (id) => departmentById(id)?.name?.trim().toLocaleLowerCase() === 'omborxona';
  const availableUsers = (departmentId) => users
    .filter((user) => !departmentId || user.department?.id === departmentId)
    .map((user) => ({ value: user.id, label: user.fullName }));
  const departmentOptions = departments.map((department) => ({ value: department.id, label: department.name }));
  const assetTypeOptions = assetTypes.map((type) => ({ value: type.id, label: type.name }));
  const userOptions = users.map((user) => ({ value: user.id, label: user.fullName }));
  const hasFilters = Boolean(searchInput || filters.status || filters.departmentId || filters.assetTypeId || filters.assignedUserId || filters.assignment);
  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  const resetFilters = () => {
    setSearchInput('');
    setFilters((current) => ({ page: 1, limit: current.limit }));
  };

  const uploadImage = (form) => async ({ file, onSuccess, onError }) => {
    const body = new FormData(); body.append('image', file);
    try {
      const response = await api.post('/assets/upload-image', body);
      form.setFieldValue('imageUrl', response.data.imageUrl);
      onSuccess?.(response.data); message.success('Rasm yuklandi');
    } catch (error) { onError?.(error); message.error(error.response?.data?.message || 'Rasmni yuklab bo‘lmadi'); }
  };

  const inventoryFor = (index) => baseInventory ? (index === 0 ? baseInventory : `${baseInventory}/${index + 1}`) : '';
  const closeCreate = () => { setCreateOpen(false); setBaseInventory(''); createForm.resetFields(); };
  const createAssets = async (values) => {
    if (!baseInventory.trim()) return message.error('Birinchi inventar raqamini kiriting');
    try {
      const response = await api.post('/assets', {
        name: values.name, model: values.model, departmentId: values.departmentId,
        assignedUserId: isWarehouse(values.departmentId) ? null : (values.assignedUserId || null),
        status: values.status || 'ACTIVE', imageUrl: values.imageUrl || null,
        items: values.items.map((item, index) => ({ inventoryNumber: inventoryFor(index), serialNumber: item.serialNumber }))
      });
      message.success(`${response.data.count} ta qurilma qo‘shildi`); closeCreate(); load();
    } catch (error) { message.error(error.response?.data?.message || 'Qurilmalarni saqlab bo‘lmadi'); }
  };

  const openEdit = (asset) => {
    setEditingAsset(asset);
    editForm.setFieldsValue({ name: asset.name, model: asset.model, inventoryNumber: asset.inventoryNumber, serialNumber: asset.serialNumber, departmentId: asset.departmentId, assignedUserId: asset.assignedUserId, status: asset.status, imageUrl: asset.imageUrl });
  };
  const updateAsset = async (values) => {
    try {
      await api.put(`/assets/${editingAsset.id}`, { ...values, assignedUserId: isWarehouse(values.departmentId) ? null : (values.assignedUserId || null), imageUrl: values.imageUrl || null, serialNumber: values.serialNumber || null });
      message.success('Qurilma yangilandi'); setEditingAsset(null); editForm.resetFields(); load();
    } catch (error) { message.error(error.response?.data?.message || 'Qurilmani yangilab bo‘lmadi'); }
  };
  const removeAsset = async (asset) => { try { await api.delete(`/assets/${asset.id}`); message.success('Qurilma o‘chirildi'); load(); } catch (error) { message.error(error.response?.data?.message || 'Qurilmani o‘chirib bo‘lmadi'); } };
  const imageButton = (form) => <Upload accept="image/*" maxCount={1} customRequest={uploadImage(form)} showUploadList={{ showRemoveIcon: false }}><Button icon={<UploadOutlined />}>Rasm tanlash</Button></Upload>;
  const userSelect = (departmentId) => <Select allowClear placeholder="Foydalanuvchini tanlang" options={availableUsers(departmentId)} />;
  const columns = [
    { title: 'Rasm', dataIndex: 'imageUrl', width: 74, render: (url) => <SafeImage src={url} /> },
    { title: 'Nomi', dataIndex: 'name', render: (text, row) => <Link to={`/assets/${row.id}`}>{text}</Link> },
    { title: 'Model', dataIndex: 'model' }, { title: 'Inventar raqami', dataIndex: 'inventoryNumber' }, { title: 'Seria raqami', dataIndex: 'serialNumber' },
    { title: 'Bo‘lim', render: (row) => row.department?.name || '-' }, { title: 'Holat', dataIndex: 'status', width: 160, render: (status) => <AssetStatus status={status} /> },
    { title: 'Qurilma foydalanuvchisi', render: (row) => row.assignedUser?.fullName || '-' },
    { title: 'Amallar', width: 130, render: (asset) => <Space size="small"><Button type="text" icon={<EditOutlined />} onClick={() => openEdit(asset)} aria-label="Tahrirlash" /><Popconfirm title="Qurilma o‘chirilsinmi?" description="Bu amalni qaytarib bo‘lmaydi." okText="O‘chirish" cancelText="Bekor qilish" okButtonProps={{ danger: true }} onConfirm={() => removeAsset(asset)}><Button type="text" danger icon={<DeleteOutlined />} aria-label="O‘chirish" /></Popconfirm></Space> }
  ];

  return <>
    <Space className="page-head"><Typography.Title level={2}>Aktivlar</Typography.Title><Button type="primary" onClick={() => setCreateOpen(true)}>Qurilma qo‘shish</Button></Space>
    <Card>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space wrap style={{ width: '100%' }}>
          <Input
            allowClear
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            prefix={<SearchOutlined />}
            placeholder="Nomi, model, inventar yoki seria raqami bo‘yicha qidirish"
            style={{ width: 360, maxWidth: '100%' }}
          />
          <Select
            allowClear
            value={filters.status}
            onChange={(value) => updateFilter('status', value)}
            placeholder="Barcha holatlar"
            options={statusOptions}
            style={{ width: 220 }}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            value={filters.departmentId}
            onChange={(value) => updateFilter('departmentId', value)}
            placeholder="Barcha bo‘limlar"
            options={departmentOptions}
            style={{ width: 210 }}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            value={filters.assetTypeId}
            onChange={(value) => updateFilter('assetTypeId', value)}
            placeholder="Barcha aktiv turlari"
            options={assetTypeOptions}
            style={{ width: 200 }}
          />
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            value={filters.assignedUserId}
            onChange={(value) => {
              setFilters((current) => ({
                ...current,
                assignedUserId: value,
                assignment: value ? undefined : current.assignment,
                page: 1,
              }));
            }}
            placeholder="Barcha foydalanuvchilar"
            options={userOptions}
            style={{ width: 220 }}
          />
          <Select
            allowClear
            value={filters.assignment}
            onChange={(value) => {
              setFilters((current) => ({
                ...current,
                assignment: value,
                assignedUserId: value ? undefined : current.assignedUserId,
                page: 1,
              }));
            }}
            placeholder="Biriktirish holati"
            options={[
              { value: 'assigned', label: 'Foydalanuvchiga biriktirilgan' },
              { value: 'unassigned', label: 'Biriktirilmagan' },
            ]}
            style={{ width: 230 }}
          />
          <Button icon={<ReloadOutlined />} onClick={resetFilters} disabled={!hasFilters}>
            Filtrlarni tozalash
          </Button>
        </Space>
        <Typography.Text type="secondary">
          {hasFilters ? `${data.total} ta natija topildi` : `Jami ${data.total} ta aktiv`}
        </Typography.Text>
        <Table
          rowKey="id"
          dataSource={data.items}
          columns={columns}
          scroll={{ x: 1250 }}
          locale={{ emptyText: hasFilters ? 'Filtrlarga mos aktiv topilmadi' : 'Aktivlar mavjud emas' }}
          pagination={{
            total: data.total,
            current: filters.page,
            pageSize: filters.limit,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            showTotal: (total, range) => `${range[0]}–${range[1]} / ${total}`,
            onChange: (page, limit) => setFilters({ ...filters, page, limit }),
          }}
        />
      </Space>
    </Card>
    <Modal title="Qurilmalarni qo‘shish" open={createOpen} onCancel={closeCreate} onOk={() => createForm.submit()} width={760} okText="Saqlash">
      <Form form={createForm} layout="vertical" onFinish={createAssets} initialValues={{ items: [{ serialNumber: '' }], status: 'ACTIVE' }}>
        <Form.Item name="name" label="Nomi" rules={[{ required: true, message: 'Qurilma nomini kiriting' }]}><Input placeholder="Masalan: Printer" /></Form.Item>
        <Form.Item name="model" label="Model" rules={[{ required: true, message: 'Modelni kiriting' }]}><Input placeholder="Masalan: Canon MF443dw" /></Form.Item>
        <Form.Item name="departmentId" label="Bo‘lim" rules={[{ required: true, message: 'Bo‘limni tanlang' }]}><Select placeholder="Bo‘limni tanlang" options={departmentOptions} onChange={() => createForm.setFieldValue('assignedUserId', null)} /></Form.Item>
        {!isWarehouse(createDepartmentId) && <Form.Item name="assignedUserId" label="Qurilma foydalanuvchisi">{userSelect(createDepartmentId)}</Form.Item>}
        <Form.Item name="status" label="Holat"><Select options={statusOptions} /></Form.Item>
        <Form.Item label="Birinchi inventar raqami" required><Input value={baseInventory} onChange={(event) => setBaseInventory(event.target.value)} placeholder="Masalan: 203020334" /></Form.Item>
        <Form.Item name="imageUrl" hidden><Input /></Form.Item><Form.Item label="Rasm">{imageButton(createForm)}</Form.Item>
        <Typography.Text strong>Inventar va seria raqamlari</Typography.Text><Form.List name="items">{(fields, { add, remove }) => <>{fields.map((field, index) => <Space key={field.key} align="baseline" style={{ display: 'flex', marginTop: 10 }}><Form.Item label="Inventar raqami"><Input disabled value={inventoryFor(index)} placeholder="Birinchi raqamni kiriting" style={{ width: 230 }} /></Form.Item><Form.Item {...field} name={[field.name, 'serialNumber']} label="Seria raqami" rules={[{ required: true, message: 'Seria raqamini kiriting' }]}><Input placeholder="Seria raqami" style={{ width: 260 }} /></Form.Item>{fields.length > 1 && <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} aria-label="Qatorni o‘chirish" />}</Space>)}<Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ serialNumber: '' })} block>Yana qurilma qo‘shish</Button></>}</Form.List>
      </Form>
    </Modal>
    <Modal title="Qurilmani tahrirlash" open={Boolean(editingAsset)} onCancel={() => { setEditingAsset(null); editForm.resetFields(); }} onOk={() => editForm.submit()} okText="Saqlash">
      <Form form={editForm} layout="vertical" onFinish={updateAsset}>
        <Form.Item name="name" label="Nomi" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="model" label="Model" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="inventoryNumber" label="Inventar raqami" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="serialNumber" label="Seria raqami"><Input /></Form.Item>
        <Form.Item name="departmentId" label="Bo‘lim" rules={[{ required: true }]}><Select options={departmentOptions} onChange={() => editForm.setFieldValue('assignedUserId', null)} /></Form.Item>
        {!isWarehouse(editDepartmentId) && <Form.Item name="assignedUserId" label="Qurilma foydalanuvchisi">{userSelect(editDepartmentId)}</Form.Item>}
        <Form.Item name="status" label="Holat" rules={[{ required: true }]}><Select options={statusOptions} /></Form.Item>
        <Form.Item name="imageUrl" hidden><Input /></Form.Item><Form.Item label="Rasm">{imageButton(editForm)}</Form.Item>
      </Form>
    </Modal>
  </>;
}
