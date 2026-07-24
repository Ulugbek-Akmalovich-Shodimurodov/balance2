import React, { useEffect, useState } from 'react';
import { FileExcelOutlined, FilePdfOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Select, Space, Typography, message } from 'antd';
import { api, downloadFile } from '../api/client.js';

const statusOptions = [
  { value: 'ACTIVE', label: 'Faol' },
  { value: 'BROKEN', label: 'Nosoz' },
  { value: 'DISPOSED', label: 'Foydalanishdan chiqarilgan' },
];

export default function ReportsPage() {
  const [departments, setDepartments] = useState([]);
  const [status, setStatus] = useState();
  const [departmentId, setDepartmentId] = useState();

  useEffect(() => {
    api.get('/departments').then((response) => setDepartments(response.data));
  }, []);

  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (departmentId) query.set('departmentId', departmentId);
  const suffix = query.size ? `?${query.toString()}` : '';
  const hasFilters = Boolean(status || departmentId);

  const download = async (extension) => {
    try {
      await downloadFile(`/reports/assets.${extension}${suffix}`, `assets.${extension}`);
    } catch {
      message.error('Hisobotni yuklab bo‘lmadi');
    }
  };

  return (
    <>
      <Typography.Title level={2}>Hisobotlar</Typography.Title>
      <Card>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            Hisobot tarkibini status va bo‘lim bo‘yicha filtrlab yuklab oling
          </Typography.Text>
          <Space wrap>
            <Select
              allowClear
              value={status}
              onChange={setStatus}
              placeholder="Barcha holatlar"
              options={statusOptions}
              style={{ width: 230 }}
            />
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              value={departmentId}
              onChange={setDepartmentId}
              placeholder="Barcha bo‘limlar"
              options={departments.map((department) => ({ value: department.id, label: department.name }))}
              style={{ width: 230 }}
            />
            <Button
              icon={<ReloadOutlined />}
              disabled={!hasFilters}
              onClick={() => { setStatus(undefined); setDepartmentId(undefined); }}
            >
              Filtrlarni tozalash
            </Button>
          </Space>
          <Space wrap>
            <Button type="primary" icon={<FileExcelOutlined />} onClick={() => download('xlsx')}>
              Excel yuklab olish
            </Button>
            <Button icon={<FilePdfOutlined />} onClick={() => download('pdf')}>
              PDF yuklab olish
            </Button>
          </Space>
        </Space>
      </Card>
    </>
  );
}
