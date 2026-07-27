import React, { useEffect, useMemo, useState } from 'react';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Card, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { api } from '../api/client.js';

const actionLabels = { CREATE: 'Yaratildi', UPDATE: 'Tahrirlandi', DELETE: 'O‘chirildi' };

const entityLabels = {
  Asset: 'Aktiv',
  User: 'Foydalanuvchi',
  Department: 'Bo‘lim',
  Transaction: 'Topshirish-qaytarish',
  Maintenance: 'Texnik xizmat',
};

const humanize = (value) => value
  ?.replaceAll('_', ' ')
  .toLocaleLowerCase('uz')
  .replace(/^./, (letter) => letter.toLocaleUpperCase('uz'));

const getActionKind = (value) => value?.split('_').at(-1);
const getActionLabel = (value) => actionLabels[getActionKind(value)] || humanize(value) || 'Noma’lum amal';
const getEntityLabel = (value) => entityLabels[value] || humanize(value) || 'Noma’lum obyekt';

export default function AuditPage() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState();
  const [entity, setEntity] = useState();

  useEffect(() => {
    api.get('/audit-logs').then((response) => setItems(response.data));
  }, []);

  const actionOptions = [...new Set(items.map((item) => getActionKind(item.action)))]
    .filter(Boolean)
    .sort()
    .map((value) => ({ value, label: actionLabels[value] || humanize(value) }));
  const entityOptions = [...new Set(items.map((item) => item.entity))]
    .filter(Boolean)
    .sort()
    .map((value) => ({ value, label: getEntityLabel(value) }));
  const needle = search.trim().toLocaleLowerCase('uz');
  const filteredItems = useMemo(() => items.filter((item) => {
    const matchesSearch = !needle || [
      item.actor?.fullName,
      item.action,
      getActionLabel(item.action),
      item.entity,
      getEntityLabel(item.entity),
      item.objectName,
      item.inventoryNumber,
      item.entityId?.toString(),
      item.ipAddress,
    ].some((value) => value?.toLocaleLowerCase('uz').includes(needle));
    return matchesSearch && (!action || getActionKind(item.action) === action) && (!entity || item.entity === entity);
  }), [items, needle, action, entity]);
  const hasFilters = Boolean(search || action || entity);

  const columns = [
    { title: 'Kim', render: (row) => row.actor?.fullName || 'Tizim' },
    { title: 'Amaliyot', dataIndex: 'action', render: (value) => <Tag color="blue">{getActionLabel(value)}</Tag> },
    { title: 'Obyekt', dataIndex: 'objectName', render: (value) => value || '—' },
    { title: 'Inventar raqami', dataIndex: 'inventoryNumber', render: (value) => value || '—' },
    {
      title: 'IP',
      dataIndex: 'ipAddress',
      render: (value) => value || <Typography.Text type="secondary">Avval saqlanmagan</Typography.Text>,
    },
    {
      title: 'Vaqti',
      dataIndex: 'createdAt',
      sorter: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      defaultSortOrder: 'descend',
      render: (value) => new Date(value).toLocaleString('uz-UZ'),
    },
  ];

  return (
    <>
      <Typography.Title level={2}>Audit jurnali</Typography.Title>
      <Card>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap>
            <Input
              allowClear
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              prefix={<SearchOutlined />}
              placeholder="Xodim, amal, obyekt, inventar raqami yoki IP bo‘yicha qidirish"
              style={{ width: 360, maxWidth: '100%' }}
            />
            <Select
              allowClear
              value={action}
              onChange={setAction}
              placeholder="Barcha amallar"
              options={actionOptions}
              style={{ width: 220 }}
            />
            <Select
              allowClear
              value={entity}
              onChange={setEntity}
              placeholder="Barcha obyektlar"
              options={entityOptions}
              style={{ width: 190 }}
            />
            <Button
              icon={<ReloadOutlined />}
              disabled={!hasFilters}
              onClick={() => { setSearch(''); setAction(undefined); setEntity(undefined); }}
            >
              Filtrlarni tozalash
            </Button>
          </Space>
          <Typography.Text type="secondary">
            {hasFilters
              ? `${filteredItems.length} ta natija topildi (jami ${items.length})`
              : `Jami ${items.length} ta audit yozuvi`}
          </Typography.Text>
          <Table
            rowKey="id"
            dataSource={filteredItems}
            columns={columns}
            scroll={{ x: 1000 }}
            pagination={{
              defaultPageSize: 20,
              showSizeChanger: true,
              pageSizeOptions: [20, 50, 100],
              showTotal: (total, range) => `${range[0]}–${range[1]} / ${total}`,
            }}
            locale={{ emptyText: hasFilters ? 'Filtrlarga mos audit yozuvi topilmadi' : 'Audit yozuvlari mavjud emas' }}
          />
        </Space>
      </Card>
    </>
  );
}
