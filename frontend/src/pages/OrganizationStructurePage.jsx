import React, { useEffect, useMemo, useState } from 'react';
import { ApartmentOutlined, BankOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { Card, Col, Empty, Row, Space, Spin, Statistic, Tabs, Tag, Tree, Typography, message } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import OrganizationsPage from './OrganizationsPage.jsx';
import DepartmentsPage from './DepartmentsPage.jsx';
import PositionsPage from './PositionsPage.jsx';

export default function OrganizationStructurePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [organizations, setOrganizations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/organizations'), api.get('/departments'), api.get('/positions'), api.get('/users')])
      .then(([organizationResponse, departmentResponse, positionResponse, userResponse]) => {
        setOrganizations(organizationResponse.data);
        setDepartments(departmentResponse.data);
        setPositions(positionResponse.data);
        setUsers(userResponse.data);
      })
      .catch((error) => message.error(error.response?.data?.message || 'Tashkilot tuzilmasini yuklab bo‘lmadi'))
      .finally(() => setLoading(false));
  }, []);

  const treeData = useMemo(() => organizations.map((organization) => {
    const organizationDepartments = departments.filter((department) => department.organizationId === organization.id);
    return {
      key: `organization-${organization.id}`,
      title: <Space><ApartmentOutlined /><strong>{organization.name}</strong><Tag color="blue">{organizationDepartments.length} ta bo‘lim</Tag></Space>,
      children: organizationDepartments.map((department) => {
        const assignments = positions.flatMap((position) => position.departmentPositions
          .filter((assignment) => assignment.departmentId === department.id)
          .map((assignment) => ({ ...assignment, position })));
        const unassignedUsers = users.filter((user) => user.department?.id === department.id && !user.departmentPosition);
        const positionNodes = assignments.map((assignment) => ({
          key: `assignment-${assignment.id}`,
          title: <Space><TeamOutlined />{assignment.position.name}<Tag>{assignment._count?.users || 0} ta xodim</Tag></Space>,
          children: users
            .filter((user) => user.departmentPosition?.id === assignment.id)
            .map((user) => ({ key: `user-${user.id}`, title: <Link to={`/users/${user.id}`}><UserOutlined /> {user.fullName}</Link> })),
        }));
        if (unassignedUsers.length) positionNodes.push({
          key: `unassigned-${department.id}`,
          title: <Space><TeamOutlined />Lavozimi belgilanmagan<Tag color="orange">{unassignedUsers.length} ta xodim</Tag></Space>,
          children: unassignedUsers.map((user) => ({ key: `user-${user.id}`, title: <Link to={`/users/${user.id}`}><UserOutlined /> {user.fullName}</Link> })),
        });
        return {
          key: `department-${department.id}`,
          title: <Space><BankOutlined /><Link to={`/departments/${department.id}`}>{department.name}</Link><Tag color="cyan">{assignments.length} ta lavozim</Tag></Space>,
          children: positionNodes,
        };
      }),
    };
  }), [organizations, departments, positions, users]);

  const activeTab = ['overview', 'organizations', 'departments', 'positions'].includes(searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'overview';
  const totalAssignments = positions.reduce((sum, position) => sum + position.departmentPositions.length, 0);
  const overview = <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} xl={6}><Card><Statistic title="Tashkilotlar" value={organizations.length} suffix="ta" /></Card></Col>
      <Col xs={24} sm={12} xl={6}><Card><Statistic title="Bo‘limlar" value={departments.length} suffix="ta" /></Card></Col>
      <Col xs={24} sm={12} xl={6}><Card><Statistic title="Lavozim biriktirishlari" value={totalAssignments} suffix="ta" /></Card></Col>
      <Col xs={24} sm={12} xl={6}><Card><Statistic title="Xodimlar" value={users.length} suffix="ta" /></Card></Col>
    </Row>
    <Card title={<Space><ApartmentOutlined />Tashkiliy ierarxiya</Space>}>
      {loading
        ? <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
        : treeData.length
          ? <Tree showLine defaultExpandAll treeData={treeData} />
          : <Empty description="Tashkilotlar mavjud emas" />}
    </Card>
  </Space>;

  return <div className="organization-workspace">
    <Space className="page-head">
      <div>
        <Typography.Text className="asset-kicker">TASHKILIY BOSHQARUV</Typography.Text>
        <Typography.Title level={2}>Tashkilot tuzilmasi</Typography.Title>
      </div>
    </Space>
    <Card className="organization-workspace-card">
      <Tabs
        activeKey={activeTab}
        destroyInactiveTabPane
        onChange={(tab) => setSearchParams(tab === 'overview' ? {} : { tab })}
        items={[
          { key: 'overview', label: 'Umumiy ko‘rinish', children: overview },
          { key: 'organizations', label: 'Tashkilotlar', children: <OrganizationsPage embedded /> },
          { key: 'departments', label: 'Bo‘limlar', children: <DepartmentsPage embedded /> },
          { key: 'positions', label: 'Lavozimlar', children: <PositionsPage embedded /> },
        ]}
      />
    </Card>
  </div>;
}
