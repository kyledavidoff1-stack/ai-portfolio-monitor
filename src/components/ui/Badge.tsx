interface BadgeProps {
  label: string;
  variant?: 'bucket1' | 'bucket2' | 'bucket3' | 'bucket4' | 'risk-on' | 'risk-off' | 'rotation' | 'dislocation' | 'confirmed' | 'challenged' | 'neutral' | 'default';
  size?: 'sm' | 'md';
}

const variantStyles: Record<string, string> = {
  bucket1: 'bg-gray-100 text-gray-700',
  bucket2: 'bg-blue-100 text-blue-700',
  bucket3: 'bg-amber-100 text-amber-700',
  bucket4: 'bg-emerald-100 text-emerald-700',
  'risk-on': 'bg-emerald-100 text-emerald-700',
  'risk-off': 'bg-red-100 text-red-700',
  rotation: 'bg-blue-100 text-blue-700',
  dislocation: 'bg-purple-100 text-purple-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  challenged: 'bg-red-100 text-red-700',
  neutral: 'bg-gray-100 text-gray-600',
  default: 'bg-gray-100 text-gray-700',
};

const sizeStyles = { sm: 'text-xs px-2 py-0.5', md: 'text-sm px-2.5 py-1' };

export function Badge({ label, variant = 'default', size = 'sm' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${variantStyles[variant]} ${sizeStyles[size]}`}>
      {label}
    </span>
  );
}
