import React from 'react';
import { Card, Table, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
export default function AuditPage(){const [items,setItems]=useState([]);useEffect(()=>{api.get('/audit-logs').then(r=>setItems(r.data));},[]);return <><Typography.Title level={2}>Audit log</Typography.Title><Card><Table rowKey="id" dataSource={items} columns={[{title:'Kim',render:r=>r.actor?.fullName||'System'},{title:'Amal',dataIndex:'action'},{title:'Entity',dataIndex:'entity'},{title:'Vaqt',dataIndex:'createdAt'}]}/></Card></>}
