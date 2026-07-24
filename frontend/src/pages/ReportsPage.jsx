import React from 'react';
import { Button, Card, Space, Typography, message } from 'antd';
import { downloadFile } from '../api/client.js';

export default function ReportsPage() {
  const download = async (path, filename) => {
    try { await downloadFile(path, filename); } catch { message.error('Hisobotni yuklab bo‘lmadi'); }
  };
  return <><Typography.Title level={2}>Hisobotlar</Typography.Title><Card><Space><Button type="primary" onClick={() => download('/reports/assets.xlsx', 'assets.xlsx')}>Excel yuklab olish</Button><Button onClick={() => download('/reports/assets.pdf', 'assets.pdf')}>PDF yuklab olish</Button></Space></Card></>;
}
