interface AvatarProps {
  initials: string;
  index: number;
  imageUrl?: string;
}

export function Avatar({ initials, index, imageUrl }: AvatarProps) {
  const colors = [
    'bg-purple-600', // First avatar
    'bg-blue-600',   // Second avatar
    'bg-blue-700',   // Third avatar
  ];

  return (
    <div className={`w-10 h-10 rounded-full border border-white/20 ${colors[index]} flex items-center justify-center text-white font-semibold text-sm overflow-hidden`}>
      {imageUrl ? (
        <img 
          src={imageUrl} 
          alt={initials} 
          className="w-full h-full object-cover"
        />
      ) : (
        initials
      )}
    </div>
  )
}
