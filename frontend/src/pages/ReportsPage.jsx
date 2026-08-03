import React, { useEffect, useState } from 'react';
import { FileExcelOutlined, FilePdfOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Checkbox, Divider, Select, Space, Typography, message } from 'antd';
import { api, downloadFile } from '../api/client.js';

const statusOptions = [
  { value: 'ACTIVE', label: 'Faol' },
  { value: 'BROKEN', label: 'Nosoz' },
  { value: 'DISPOSED', label: 'Foydalanishdan chiqarilgan' },
];

export default function ReportsPage() {
  const [departments, setDepartments] = useState([]);
  const [status, setStatus] = useState();
  const [departmentIds, setDepartmentIds] = useState([]);

  useEffect(() => {
    api.get('/departments').then((response) => setDepartments(response.data));
  }, []);

  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (departmentIds.length) query.set('departmentIds', departmentIds.join(','));
  const suffix = query.size ? `?${query.toString()}` : '';
  const hasFilters = Boolean(status || departmentIds.length);
  const allDepartmentsSelected = departments.length > 0 && departmentIds.length === departments.length;
  const someDepartmentsSelected = departmentIds.length > 0 && !allDepartmentsSelected;
  const departmentOptions = departments.map((department) => ({ value: department.id, label: department.name }));

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
              mode="multiple"
              showSearch
              optionFilterProp="label"
              value={departmentIds}
              onChange={setDepartmentIds}
              placeholder="Barcha bo‘limlar"
              maxTagCount="responsive"
              options={departmentOptions}
              optionRender={(option) => (
                <Space>
                  <Checkbox checked={departmentIds.includes(option.value)} style={{ pointerEvents: 'none' }} />
                  {option.label}
                </Space>
              )}
              dropdownRender={(menu) => (
                <>
                  <div style={{ padding: '6px 12px' }}>
                    <Checkbox
                      checked={allDepartmentsSelected}
                      indeterminate={someDepartmentsSelected}
                      onChange={(event) => setDepartmentIds(
                        event.target.checked ? departments.map((department) => department.id) : []
                      )}
                    >
                      Barchasini tanlash
                    </Checkbox>
                  </div>
                  <Divider style={{ margin: '4px 0' }} />
                  {menu}
                </>
              )}
              style={{ width: 360, maxWidth: '100%' }}
            />
            <Button
              icon={<ReloadOutlined />}
              disabled={!hasFilters}
              onClick={() => { setStatus(undefined); setDepartmentIds([]); }}
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
