interface BadgeProps {
  label: string;
  variant?: 'bucket1' | 'bucket2' | 'bucket3' | 'bucket4' | 'risk-on' | 'risk-off' | 'rotation' | 'dislocation' | 'confirmed' | 'challenged' | 'neutral' | 'default';
  size?: 'sm' | 'md';
}

const variantStyles: Record<string, string> = {
  bucket1: 'bg-indigo-950 text-indigo-300',
  bucket2: 'bg-blue-950 text-blue-300',
  bucket3: 'bg-amber-950 text-amber-300',
  bucket4: 'bg-emerald-950 text-emerald-300',
  'risk-on': 'bg-emerald-950 text-emerald-300',
  'risk-off': 'bg-red-950 text-red-300',
  rotation: 'bg-blue-950 text-blue-300',
  dislocation: 'bg-purple-950 text-purple-300',
  confirmed: 'bg-emerald-950 text-emerald-300',
  challenged: 'bg-red-950 text-red-300',
  neutral: 'bg-gray-800 text-gray-400',
  default: 'bg-gray-800 text-gray-300',
};

const sizeStyles = { sm: 'text-xs px-2 py-0.5', md: 'text-sm px-2.5 py-1' };

export function Badge({ label, variant = 'default', size = 'sm' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${variantStyles[variant]} ${sizeStyles[size]}`}>
      {label}
    </span>
  );
}
