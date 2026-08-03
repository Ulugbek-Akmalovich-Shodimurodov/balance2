import React from 'react';
import { Link } from 'react-router-dom';

export default function AssetInventoryLink({ asset, id, inventoryNumber }) {
  const assetId = id ?? asset?.id;
  const value = inventoryNumber ?? asset?.inventoryNumber;

  if (!value) return '—';
  if (!assetId) return value;

  return (
    <Link to={`/assets/${assetId}`} title={`${value} raqamli qurilmani ochish`}>
      {value}
    </Link>
  );
}
