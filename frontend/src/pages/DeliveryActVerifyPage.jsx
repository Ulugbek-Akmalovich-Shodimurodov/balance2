import React, { useEffect, useState } from 'react';
import { CheckCircleFilled, FileProtectOutlined } from '@ant-design/icons';
import { Card, Descriptions, Result, Space, Spin, Tag, Typography } from 'antd';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';

export default function DeliveryActVerifyPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.get(`/delivery-acts/verify/${id}`, {
      params: { token: searchParams.get('token') },
    })
      .then(({ data: response }) => {
        if (response.valid) setData(response);
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, [id, searchParams]);

  if (failed) {
    return (
      <main className="delivery-act-verify-page">
        <Result
          status="error"
          title="Dalolatnoma tasdiqlanmadi"
          subTitle="QR-kod yaroqsiz, hujjat imzolanmagan yoki ma’lumotlar o‘zgartirilgan."
        />
      </main>
    );
  }

  if (!data) {
    return <main className="delivery-act-verify-page"><Spin size="large" /></main>;
  }

  return (
    <main className="delivery-act-verify-page">
      <Card className="delivery-act-verify-card">
        <Result
          icon={<CheckCircleFilled style={{ color: '#237a3b' }} />}
          title="Dalolatnoma haqiqiy"
          subTitle="Hujjat tizimda elektron tarzda imzolangan."
        />
        <Descriptions bordered column={1} size="middle">
          <Descriptions.Item label="Dalolatnoma">
            <Typography.Text strong><FileProtectOutlined /> {data.number}</Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="Holati"><Tag color="green">IMZOLANGAN</Tag></Descriptions.Item>
          <Descriptions.Item label="Qurilmalar">
            <Space wrap>
              {(data.assets || []).map((asset) => (
                <Tag key={asset.id || asset.inventoryNumber}>
                  {asset.model || asset.name} · {asset.inventoryNumber}
                </Tag>
              ))}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Qabul qiluvchi">{data.recipient || '—'}</Descriptions.Item>
          <Descriptions.Item label="Imzolangan vaqt">
            {new Date(data.signedAt).toLocaleString('uz-UZ')}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </main>
  );
}
