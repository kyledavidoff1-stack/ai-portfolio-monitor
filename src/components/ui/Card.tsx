import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
}

const paddingMap = { sm: 'p-3', md: 'p-4', lg: 'p-6' };

export function Card({ children, className = '', padding = 'md' }: CardProps) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-lg ${paddingMap[padding]} ${className}`}>
      {children}
    </div>
  );
}
