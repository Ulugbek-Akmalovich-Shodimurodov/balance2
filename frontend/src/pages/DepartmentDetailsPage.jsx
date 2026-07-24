import React, { useEffect, useMemo, useState } from 'react';
import { ApartmentOutlined, BankOutlined, CheckCircleFilled, EditOutlined, ExclamationCircleFilled, LaptopOutlined, ReloadOutlined, SearchOutlined, StopFilled } from '@ant-design/icons';
import { Button, Card, Empty, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd';
import { Link, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { api } from '../api/client.js';
import SafeImage from '../components/SafeImage.jsx';

const statusInfo = {
  ACTIVE: { label: 'Faol', icon: CheckCircleFilled, className: 'asset-status-active' },
  BROKEN: { label: 'Nosoz', icon: ExclamationCircleFilled, className: 'asset-status-broken' },
  DISPOSED: { label: 'Foydalanishdan chiqarilgan', icon: StopFilled, className: 'asset-status-disposed' }
};

const AssetStatus = ({ status }) => {
  const item = statusInfo[status] || { label: status || 'Noma’lum', icon: ExclamationCircleFilled, className: 'asset-status-unknown' };
  const Icon = item.icon;
  return <span className={`asset-status-pill ${item.className}`}><Icon />{item.label}</span>;
};

export default function DepartmentDetailsPage() {
  const { id } = useParams();
  const user = useSelector((state) => state.auth.user);
  const isAdmin = user?.role === 'ADMIN';
  const [department, setDepartment] = useState();
  const [editingAsset, setEditingAsset] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState();
  const [assignmentFilter, setAssignmentFilter] = useState();
  const [scopeFilter, setScopeFilter] = useState();
  const [form] = Form.useForm();
  const load = () => api.get(`/departments/${id}`).then((response) => setDepartment(response.data));
  useEffect(() => { load(); }, [id]);

  const ownAssets = department?.assets || [];
  const childGroups = department?.subDepartmentAssets || [];
  const needle = search.trim().toLocaleLowerCase('uz');
  const matchesFilters = (asset) => {
    const matchesSearch = !needle || [
      asset.name,
      asset.model,
      asset.inventoryNumber,
      asset.serialNumber,
      asset.assignedUser?.fullName,
    ].some((value) => value?.toLocaleLowerCase('uz').includes(needle));
    const matchesStatus = !statusFilter || asset.status === statusFilter;
    const matchesAssignment = !assignmentFilter
      || (assignmentFilter === 'assigned' ? Boolean(asset.assignedUser) : !asset.assignedUser);
    return matchesSearch && matchesStatus && matchesAssignment;
  };
  const filteredOwnAssets = useMemo(
    () => (scopeFilter ? [] : ownAssets.filter(matchesFilters)),
    [ownAssets, needle, statusFilter, assignmentFilter, scopeFilter]
  );
  const filteredChildGroups = useMemo(() => childGroups
    .filter((group) => !scopeFilter || group.id === scopeFilter)
    .map((group) => ({ ...group, assets: group.assets.filter(matchesFilters) }))
    .filter((group) => group.assets.length > 0), [childGroups, needle, statusFilter, assignmentFilter, scopeFilter]);
  const filteredTotal = filteredOwnAssets.length
    + filteredChildGroups.reduce((total, group) => total + group.assets.length, 0);
  const hasFilters = Boolean(search || statusFilter || assignmentFilter || scopeFilter);
  const resetFilters = () => {
    setSearch('');
    setStatusFilter(undefined);
    setAssignmentFilter(undefined);
    setScopeFilter(undefined);
  };

  if (!department) return null;

  const updateStatus = async (values) => {
    try {
      await api.put(`/assets/${editingAsset.id}`, { status: values.status });
      message.success('Qurilma holati yangilandi');
      setEditingAsset(null); form.resetFields(); load();
    } catch (error) { message.error(error.response?.data?.message || 'Holatni yangilab bo‘lmadi'); }
  };

  const assetColumns = [
    { title: 'Rasm', dataIndex: 'imageUrl', width: 72, render: (url) => <SafeImage src={url} width={42} height={42} /> },
    { title: 'Qurilma', dataIndex: 'name', render: (name, asset) => <Link to={`/assets/${asset.id}`}>{name}</Link> },
    { title: 'Model', dataIndex: 'model' }, { title: 'Inventar raqami', dataIndex: 'inventoryNumber' }, { title: 'Seria raqami', dataIndex: 'serialNumber' },
    { title: 'Holat', dataIndex: 'status', width: 160, render: (status) => <AssetStatus status={status} /> },
    { title: 'Foydalanuvchi', render: (asset) => asset.assignedUser?.fullName || 'Biriktirilmagan' },
    ...(isAdmin ? [{ title: 'Amal', width: 95, render: (asset) => <Button type="text" icon={<EditOutlined />} onClick={() => { setEditingAsset(asset); form.setFieldsValue({ status: asset.status }); }}>Holat</Button> }] : [])
  ];
  return <div className="department-detail">
    <Card className="department-hero" bordered={false}><div className="department-hero-icon"><BankOutlined /></div><div><Typography.Text className="asset-kicker">BO‘LIM KARTASI</Typography.Text><Typography.Title level={2}>{department.name}</Typography.Title><Typography.Text>{department.parent ? `Yuqori bo‘lim: ${department.parent.name}` : 'Asosiy bo‘lim'}</Typography.Text></div><div className="department-stat"><LaptopOutlined /><span><strong>{department.totalAssets}</strong>Jami qurilmalar</span></div></Card>
    <Card className="department-filter-card">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space wrap>
          <Input
            allowClear
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            prefix={<SearchOutlined />}
            placeholder="Qurilma, model, inventar, seria yoki foydalanuvchi bo‘yicha qidirish"
            style={{ width: 390, maxWidth: '100%' }}
          />
          <Select
            allowClear
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="Barcha holatlar"
            options={[
              { value: 'ACTIVE', label: 'Faol' },
              { value: 'BROKEN', label: 'Nosoz' },
              { value: 'DISPOSED', label: 'Foydalanishdan chiqarilgan' },
            ]}
            style={{ width: 220 }}
          />
          <Select
            allowClear
            value={assignmentFilter}
            onChange={setAssignmentFilter}
            placeholder="Biriktirish holati"
            options={[
              { value: 'assigned', label: 'Foydalanuvchiga biriktirilgan' },
              { value: 'unassigned', label: 'Biriktirilmagan' },
            ]}
            style={{ width: 230 }}
          />
          {childGroups.length > 0 && (
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              value={scopeFilter}
              onChange={setScopeFilter}
              placeholder="Barcha quyi bo‘limlar"
              options={childGroups.map((group) => ({ value: group.id, label: group.name }))}
              style={{ width: 230 }}
            />
          )}
          <Button icon={<ReloadOutlined />} onClick={resetFilters} disabled={!hasFilters}>
            Filtrlarni tozalash
          </Button>
        </Space>
        <Typography.Text type="secondary">
          {hasFilters
            ? `${filteredTotal} ta natija topildi (jami ${department.totalAssets})`
            : `Jami ${department.totalAssets} ta qurilma`}
        </Typography.Text>
      </Space>
    </Card>
    {!scopeFilter && <Card title="Bo‘limning o‘z qurilmalari" className="department-assets-card" extra={<Tag color="blue" icon={<ApartmentOutlined />}>{filteredOwnAssets.length} ta qurilma</Tag>}>{filteredOwnAssets.length ? <Table rowKey="id" dataSource={filteredOwnAssets} columns={assetColumns} scroll={{ x: 1000 }} pagination={{ defaultPageSize: 8, showSizeChanger: true, pageSizeOptions: [8, 20, 50], showTotal: (total, range) => `${range[0]}–${range[1]} / ${total}` }} /> : <Empty description={hasFilters ? 'Filtrlarga mos qurilma topilmadi' : 'Bu bo‘limning o‘ziga biriktirilgan qurilma yo‘q'} image={Empty.PRESENTED_IMAGE_SIMPLE} />}</Card>}
    {filteredChildGroups.length > 0 && <div className="subdepartment-list"><Typography.Title level={4}>Quyi bo‘limlardagi qurilmalar</Typography.Title>{filteredChildGroups.map((group) => <Card key={group.id} title={<Link to={`/departments/${group.id}`}><BankOutlined /> {group.name}</Link>} className="department-assets-card subdepartment-card" extra={<Tag color="green">{group.assets.length} ta qurilma</Tag>}><Table rowKey="id" dataSource={group.assets} columns={assetColumns} scroll={{ x: 1000 }} pagination={{ defaultPageSize: 8, showSizeChanger: true, pageSizeOptions: [8, 20, 50], showTotal: (total, range) => `${range[0]}–${range[1]} / ${total}` }} /></Card>)}</div>}
    {scopeFilter && filteredChildGroups.length === 0 && <Card><Empty description="Tanlangan quyi bo‘limda filtrlarga mos qurilma topilmadi" image={Empty.PRESENTED_IMAGE_SIMPLE} /></Card>}
    <Modal title="Qurilma holatini o‘zgartirish" open={Boolean(editingAsset)} onCancel={() => { setEditingAsset(null); form.resetFields(); }} onOk={() => form.submit()} okText="Saqlash">
      <Form form={form} layout="vertical" onFinish={updateStatus}><Typography.Paragraph>{editingAsset?.name} — {editingAsset?.inventoryNumber}</Typography.Paragraph><Form.Item name="status" label="Holat" rules={[{ required: true }]}><Select options={[{ value: 'ACTIVE', label: 'Faol / foydalanishga tayyor' }, { value: 'BROKEN', label: 'Nosoz' }, { value: 'DISPOSED', label: 'Foydalanishdan chiqarilgan' }]} /></Form.Item></Form>
    </Modal>
  </div>;
}
