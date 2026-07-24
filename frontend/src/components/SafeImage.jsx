import React, { useState } from 'react';
import { PictureOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Image } from 'antd';

export default function SafeImage({
  src,
  width = 44,
  height = 44,
  rounded = false,
  user = false,
  preview = false,
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return user
      ? <Avatar size={Math.max(width, height)} icon={<UserOutlined />} />
      : (
        <span
          style={{
            width,
            height,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: rounded ? '50%' : 6,
            background: '#f0f2f5',
            color: '#8c8c8c',
          }}
        >
          <PictureOutlined />
        </span>
      );
  }

  return (
    <Image
      src={src}
      width={width}
      height={height}
      preview={preview}
      onError={() => setFailed(true)}
      style={{ objectFit: 'cover', borderRadius: rounded ? '50%' : 6 }}
    />
  );
}
