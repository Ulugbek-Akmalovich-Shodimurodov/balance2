import React from 'react';
import { Link } from 'react-router-dom';

export default function UserNameLink({ user, id, fullName, fallback = '—' }) {
  const userId = id ?? user?.id;
  const name = fullName ?? user?.fullName;

  if (!name) return fallback;
  if (!userId) return name;

  return (
    <Link to={`/users/${userId}`} title={`${name} profilini ochish`}>
      {name}
    </Link>
  );
}
