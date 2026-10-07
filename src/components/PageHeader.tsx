import { Link } from 'react-router';
import { ArrowLeft } from '@phosphor-icons/react';

export function PageHeader({ title, back }: { title: string; back?: string }) {
  return (
    <header className="page-header">
      {back && (
        <Link to={back} className="back-link" aria-label="Назад">
          <ArrowLeft size={22} weight="bold" />
        </Link>
      )}
      <h1>{title}</h1>
    </header>
  );
}
