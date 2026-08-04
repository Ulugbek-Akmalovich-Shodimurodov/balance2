import React, { useEffect, useMemo, useState } from 'react';
import {
  DeleteOutlined,
  EditOutlined,
  FileExcelOutlined,
  FileZipOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import {
  Alert,
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
import { useSelector } from 'react-redux';
import { api, downloadFile } from '../api/client.js';
import SafeImage from '../components/SafeImage.jsx';
import UserNameLink from '../components/UserNameLink.jsx';

const roleOptions = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'ORGANIZATION_ADMIN', label: 'Tashkilot administratori' },
  { value: 'MANAGER', label: 'Menejer' },
  { value: 'TECHNICIAN', label: 'Texnik' },
  { value: 'VIEWER', label: 'Kuzatuvchi' },
];

const roleLabels = Object.fromEntries(roleOptions.map(({ value, label }) => [value, label]));
const roleColors = { ADMIN: 'red', SUPER_ADMIN: 'red', ORGANIZATION_ADMIN: 'purple', MANAGER: 'blue', TECHNICIAN: 'gold', VIEWER: 'default' };

export default function UsersPage() {
  const currentUser = useSelector((state) => state.auth.user);
  const isSuperAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser?.role);
  const [items, setItems] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState();
  const [importImages, setImportImages] = useState();
  const [importPreview, setImportPreview] = useState();
  const [importBusy, setImportBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState();
  const [departmentFilter, setDepartmentFilter] = useState();
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const createDepartmentId = Form.useWatch('departmentId', createForm);
  const editDepartmentId = Form.useWatch('departmentId', editForm);
  const createRole = Form.useWatch('role', createForm);
  const editRole = Form.useWatch('role', editForm);

  const load = () => api.get('/users').then((response) => setItems(response.data));

  useEffect(() => {
    load();
    api.get('/departments').then((response) => setDepartments(response.data));
    api.get('/positions').then((response) => setPositions(response.data));
    api.get('/organizations').then((response) => setOrganizations(response.data));
  }, []);

  const departmentOptions = departments.map((department) => ({
    value: department.id,
    label: department.name,
  }));
  const positionOptions = (departmentId) => positions.flatMap((position) => position.departmentPositions
    .filter((assignment) => assignment.departmentId === departmentId)
    .map((assignment) => ({ value: assignment.id, label: position.name })));

  const normalizedSearch = search.trim().toLocaleLowerCase('uz');
  const filteredItems = useMemo(() => items.filter((user) => {
    const matchesSearch = !normalizedSearch || [
      user.fullName,
      user.departmentPosition?.position?.name,
      user.login,
      user.phone,
      user.servicePhone,
      user.extensionNumber,
      user.passportSeries,
      user.pinfl,
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

  const closeImport = () => {
    setImportOpen(false);
    setImportFile(undefined);
    setImportImages(undefined);
    setImportPreview(undefined);
  };

  const uploadImport = async (commit = false) => {
    if (!importFile) return message.warning('Excel faylini tanlang');
    const body = new FormData();
    body.append('file', importFile);
    if (importImages) body.append('images', importImages);
    setImportBusy(true);
    try {
      const response = await api.post(`/users/import${commit ? '?commit=true' : ''}`, body);
      if (commit) {
        message.success(`${response.data.imported} ta xodim va ${response.data.importedImages || 0} ta rasm import qilindi`);
        closeImport();
        load();
      } else {
        setImportPreview(response.data);
        if (response.data.summary.invalid === 0) message.success('Fayl tekshirildi, importga tayyor');
      }
    } catch (error) {
      if (error.response?.data?.details) setImportPreview(error.response.data.details);
      message.error(error.response?.data?.message || 'Excel faylini qayta ishlab bo‘lmadi');
    } finally {
      setImportBusy(false);
    }
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
      const payload = {
        ...values,
        departmentPositionId: values.departmentPositionId || null,
        managedOrganizationId: values.role === 'ORGANIZATION_ADMIN' ? values.managedOrganizationId : null,
        passportSeries: values.passportSeries?.replace(/[\s-]/g, '').toUpperCase(),
        pinfl: values.pinfl?.replace(/\s/g, ''),
      };
      if (mode === 'create') await api.post('/users', payload);
      else await api.put(`/users/${editing.id}`, payload);
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
      departmentPositionId: user.departmentPosition?.id,
      login: user.login,
      phone: user.phone,
      servicePhone: user.servicePhone,
      extensionNumber: user.extensionNumber,
      passportSeries: user.passportSeries,
      pinfl: user.pinfl,
      role: user.role,
      managedOrganizationId: user.managedOrganizationId,
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

  const fields = (form, isCreate) => {
    const departmentId = isCreate ? createDepartmentId : editDepartmentId;
    const selectedRole = isCreate ? createRole : editRole;
    const availableRoles = isSuperAdmin ? roleOptions : roleOptions.filter((item) => !['SUPER_ADMIN', 'ADMIN', 'ORGANIZATION_ADMIN'].includes(item.value));
    return (
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
      <Form.Item name="phone" label="Shaxsiy telefon raqami">
        <Input placeholder="+998 90 123 45 67" />
      </Form.Item>
      <Form.Item name="servicePhone" label="Xizmat telefoni">
        <Input placeholder="+998 71 123 45 67" />
      </Form.Item>
      <Form.Item
        name="extensionNumber"
        label="Ichki raqam"
        rules={[{ pattern: /^\d{1,12}$/, message: 'Ichki raqam faqat raqamlardan iborat bo‘lishi kerak' }]}
      >
        <Input placeholder="Masalan: 01401" maxLength={12} inputMode="numeric" />
      </Form.Item>
      <Form.Item
        name="passportSeries"
        label="Pasport seria raqami"
        rules={[
          { required: isCreate, message: 'Pasport seria raqamini kiriting' },
          { pattern: /^[A-Za-z]{2}\d{7}$/, message: 'Masalan: AA1234567' },
        ]}
      >
        <Input placeholder="AA1234567" maxLength={9} style={{ textTransform: 'uppercase' }} />
      </Form.Item>
      <Form.Item
        name="pinfl"
        label="JShShIR"
        rules={[
          { required: isCreate, message: 'JShShIRni kiriting' },
          { pattern: /^\d{14}$/, message: 'JShShIR 14 ta raqamdan iborat bo‘lishi kerak' },
        ]}
      >
        <Input placeholder="14 ta raqam" maxLength={14} inputMode="numeric" />
      </Form.Item>
      <Form.Item name="role" label="Rol" initialValue="VIEWER" rules={[{ required: true }]}>
        <Select options={availableRoles} />
      </Form.Item>
      {isSuperAdmin && selectedRole === 'ORGANIZATION_ADMIN' && <Form.Item name="managedOrganizationId" label="Boshqaradigan tashkilot" rules={[{ required: true, message: 'Tashkilotni tanlang' }]}>
        <Select showSearch optionFilterProp="label" options={organizations.map((item) => ({ value: item.id, label: item.name }))} />
      </Form.Item>}
      <Form.Item name="departmentId" label="Bo‘lim" rules={[{ required: selectedRole !== 'ORGANIZATION_ADMIN', message: 'Bo‘limni tanlang' }]}>
        <Select allowClear options={departmentOptions} onChange={() => form.setFieldValue('departmentPositionId', undefined)} />
      </Form.Item>
      <Form.Item name="departmentPositionId" label="Lavozimi (ixtiyoriy)">
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          disabled={!departmentId}
          placeholder={departmentId ? 'Lavozimni tanlang yoki bo‘sh qoldiring' : 'Avval bo‘limni tanlang'}
          options={positionOptions(departmentId)}
        />
      </Form.Item>
      <Form.Item name="imageUrl" hidden>
        <Input />
      </Form.Item>
      <Form.Item label="Rasm">{imageUpload(form)}</Form.Item>
    </>
    );
  };

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
      render: (name, user) => <UserNameLink user={user} />,
    },
    { title: 'Lavozimi', render: (user) => user.departmentPosition?.position?.name || '—' },
    { title: 'Login', dataIndex: 'login' },
    { title: 'Shaxsiy telefon', dataIndex: 'phone', width: 165, render: (phone) => phone || '—' },
    { title: 'Xizmat telefoni', width: 190, render: (user) => user.servicePhone ? `${user.servicePhone}${user.extensionNumber ? ` (${user.extensionNumber})` : ''}` : '—' },
    { title: 'Pasport', dataIndex: 'passportSeries', render: (value) => value || '—' },
    { title: 'JShShIR', dataIndex: 'pinfl', render: (value) => value || '—' },
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
        <Typography.Title level={2}>Foydalanuvchilar</Typography.Title>
        <Space>
          <Button icon={<FileExcelOutlined />} onClick={() => setImportOpen(true)}>Excel import</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Xodim qo‘shish</Button>
        </Space>
      </Space>

      <Card>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap style={{ width: '100%' }}>
            <Input
              allowClear
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              prefix={<SearchOutlined />}
              placeholder="Ism, lavozim, login, pasport, JShShIR yoki bo‘lim bo‘yicha qidirish"
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
            scroll={{ x: 1300 }}
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
        className="asset-import-modal"
        title={<div><Typography.Title level={4}>Xodimlarni Excel orqali import qilish</Typography.Title><Typography.Text type="secondary">10 000 tagacha xodimni tekshirib, xavfsiz import qiling</Typography.Text></div>}
        open={importOpen}
        onCancel={closeImport}
        width={900}
        centered
        destroyOnClose
        footer={[
          <Button key="close" onClick={closeImport} disabled={importBusy}>Yopish</Button>,
          <Button key="check" onClick={() => uploadImport(false)} loading={importBusy} disabled={!importFile}>Tekshirish</Button>,
          <Button key="import" type="primary" icon={<FileExcelOutlined />} onClick={() => uploadImport(true)} loading={importBusy} disabled={!importPreview || importPreview.summary?.invalid > 0}>Import qilish</Button>,
        ]}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="Yangi xodimlar shablonidan foydalaning"
            description={<Space wrap><span>Login, pasport va JShShIR takrorlanmas bo‘lishi kerak. Profil rasmi nomini Excelda yozib, rasmlarni ZIP faylga joylang.</span><Button size="small" icon={<FileExcelOutlined />} onClick={() => downloadFile('/users/import-template', 'xodimlar-import-shabloni.xlsx')}>Shablonni yuklash</Button></Space>}
          />
          <Upload.Dragger
            accept=".xlsx"
            maxCount={1}
            beforeUpload={(file) => { setImportFile(file); setImportPreview(undefined); return false; }}
            onRemove={() => { setImportFile(undefined); setImportPreview(undefined); }}
            fileList={importFile ? [importFile] : []}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Xodimlar Excel faylini tanlang</p>
            <p className="ant-upload-hint">Faqat .xlsx, maksimal 15 MB</p>
          </Upload.Dragger>
          <Upload.Dragger
            accept=".zip"
            maxCount={1}
            beforeUpload={(file) => { setImportImages(file); setImportPreview(undefined); return false; }}
            onRemove={() => { setImportImages(undefined); setImportPreview(undefined); }}
            fileList={importImages ? [importImages] : []}
            className="asset-import-images"
          >
            <p className="ant-upload-drag-icon"><FileZipOutlined /></p>
            <p className="ant-upload-text">Profil rasmlari ZIP fayli — ixtiyoriy</p>
            <p className="ant-upload-hint">JPG, PNG yoki WEBP; ZIP maksimal 100 MB, har bir rasm maksimal 8 MB</p>
          </Upload.Dragger>
          {importPreview?.summary && <div className="import-summary-grid">
            <Card size="small"><span>Jami xodim</span><strong>{importPreview.summary.total}</strong></Card>
            <Card size="small" className="import-summary-valid"><span>Importga tayyor</span><strong>{importPreview.summary.valid}</strong></Card>
            <Card size="small" className="import-summary-invalid"><span>Xatolik</span><strong>{importPreview.summary.invalid}</strong></Card>
            <Card size="small"><span>Mos rasmlar</span><strong>{importPreview.images?.matched || 0}</strong><small>{importPreview.images?.unused || 0} ta ishlatilmagan</small></Card>
          </div>}
          {importPreview?.errors?.length > 0 && <>
            <Alert type="error" showIcon message="Xatolarni tuzatib, faylni qayta yuklang" description={importPreview.errorsTruncated ? 'Dastlabki 500 ta xato ko‘rsatildi.' : undefined} />
            <Table
              size="small"
              rowKey={(row, index) => `${row.rowNumber}-${index}`}
              dataSource={importPreview.errors}
              pagination={{ pageSize: 8, showSizeChanger: false }}
              columns={[
                { title: 'Qator', dataIndex: 'rowNumber', width: 80 },
                { title: 'Login', dataIndex: 'identifier', width: 180 },
                { title: 'Muammo', dataIndex: 'messages', render: (items) => <Space wrap>{items.map((item) => <Tag color="red" key={item}>{item}</Tag>)}</Space> },
              ]}
            />
          </>}
          {importPreview?.summary?.invalid === 0 && <Alert type="success" showIcon message={`${importPreview.summary.valid} ta xodim importga tayyor`} description="Import tugagach xodimlar ro‘yxati avtomatik yangilanadi." />}
        </Space>
      </Modal>

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
